import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors'

const PRODUCTION_URL = 'https://anuban-chumsang-document-system.60010106nkw1.workers.dev'
const ALLOWED_ROLES = new Set(['admin', 'director', 'officer', 'staff'])

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getAdminContext(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return { ok: false as const, status: 401, message: 'กรุณาเข้าสู่ระบบ' }

  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? ''
  let secretKey = ''
  try {
    const keys = JSON.parse(raw)
    const keyRef = keys.default ?? Object.values(keys)[0] ?? ''
    secretKey = Deno.env.get(String(keyRef)) ?? ''
    if (!secretKey && typeof keyRef === 'string' && keyRef.startsWith('sb_secret_')) {
      secretKey = keyRef
    }
  } catch {
    secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  }
  if (!secretKey) return { ok: false as const, status: 500, message: 'การตั้งค่าเซิร์ฟเวอร์ไม่สมบูรณ์' }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(match[1])
  if (userError || !userData.user) {
    console.error('user JWT validation failed', userError?.message ?? 'user not found')
    return { ok: false as const, status: 401, message: 'เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' }
  }

  const userId = userData.user.id
  const { data: userRoleRows, error: roleError } = await admin
    .from('user_roles').select('role_id').eq('user_id', userId)
  if (roleError) {
    console.error('role lookup failed', roleError.message)
    return { ok: false as const, status: 500, message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }
  }

  const roleIds = (userRoleRows ?? []).map((row: any) => row.role_id)
  if (!roleIds.length) return { ok: false as const, status: 403, message: 'ไม่มีสิทธิ์จัดการผู้ใช้งาน' }

  const { data: permissionRows, error: permissionError } = await admin
    .from('role_permissions').select('role_id,permissions!inner(code)').in('role_id', roleIds)
  if (permissionError) {
    console.error('permission lookup failed', permissionError.message)
    return { ok: false as const, status: 500, message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }
  }

  const allowed = (permissionRows ?? []).some((row: any) => row.permissions?.code === 'users.manage')
  if (!allowed) return { ok: false as const, status: 403, message: 'ไม่มีสิทธิ์จัดการผู้ใช้งาน' }

  return { ok: true as const, userId, admin }
}

async function listUsers(admin: any) {
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authError) return response({ error: authError.message }, 500)

  const users = authData.users ?? []
  if (!users.length) return response({ users: [] })

  const ids = users.map((u: any) => u.id)
  const [{ data: profiles, error: profileError }, { data: assignments, error: roleError }] = await Promise.all([
    admin.from('profiles').select('id,full_name,email,leave_policy').in('id', ids),
    admin.from('user_roles').select('user_id,roles!inner(code,name)').in('user_id', ids),
  ])

  if (profileError || roleError) {
    console.error('user data query failed', profileError?.message ?? roleError?.message)
    return response({ error: 'โหลดข้อมูลผู้ใช้งานไม่สำเร็จ' }, 500)
  }

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const roleMap = new Map<string, any[]>()
  for (const row of assignments ?? []) {
    const list = roleMap.get(row.user_id) ?? []
    list.push(row.roles)
    roleMap.set(row.user_id, list)
  }

  return response({
    users: users.map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: profileMap.get(u.id)?.full_name ?? u.user_metadata?.full_name ?? '',
      confirmed: Boolean(u.email_confirmed_at),
      last_sign_in_at: u.last_sign_in_at,
      created_at: u.created_at,
      leave_policy: profileMap.get(u.id)?.leave_policy ?? 'other',
      roles: roleMap.get(u.id) ?? [],
    })),
  })
}

async function inviteUser(admin: any, actorId: string, body: any) {
  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const roleCode = String(body.role_code ?? 'staff').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return response({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, 400)
  if (!fullName) return response({ error: 'กรุณาระบุชื่อผู้ใช้งาน' }, 400)
  if (!ALLOWED_ROLES.has(roleCode)) return response({ error: 'บทบาทไม่ถูกต้อง' }, 400)

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName }, redirectTo: PRODUCTION_URL + '?type=invite',
  })
  if (error || !data.user) return response({ error: error?.message ?? 'สร้างคำเชิญไม่สำเร็จ' }, 400)

  const { data: role, error: roleError } = await admin.from('roles')
    .select('id,code,name').eq('code', roleCode).single()
  if (roleError || !role) return response({ error: 'ไม่พบบทบาทที่เลือก' }, 500)

  const { error: profileError } = await admin.from('profiles')
    .upsert({ id: data.user.id, full_name: fullName, email, leave_policy: 'other' }, { onConflict: 'id' })
  if (profileError) return response({ error: 'สร้างโปรไฟล์ไม่สำเร็จ: ' + profileError.message }, 500)

  const { error: assignmentError } = await admin.from('user_roles')
    .upsert({ user_id: data.user.id, role_id: role.id, assigned_by: actorId }, { onConflict: 'user_id,role_id' })
  if (assignmentError) return response({ error: 'กำหนดบทบาทไม่สำเร็จ: ' + assignmentError.message }, 500)

  return response({ ok: true, user_id: data.user.id })
}

async function updateUser(admin: any, actorId: string, body: any) {
  const targetId = String(body.user_id ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const roleCode = String(body.role_code ?? '').trim()
  if (!targetId || !fullName || !ALLOWED_ROLES.has(roleCode)) return response({ error: 'ข้อมูลไม่ครบถ้วน' }, 400)

  const { data: role, error: roleError } = await admin.from('roles').select('id,code').eq('code', roleCode).single()
  if (roleError || !role) return response({ error: 'ไม่พบบทบาทที่เลือก' }, 400)

  const { data: targetRoles } = await admin.from('user_roles').select('role_id,roles!inner(code)').eq('user_id', targetId)
  const targetIsAdmin = (targetRoles ?? []).some((x: any) => x.roles?.code === 'admin')

  if (targetIsAdmin && roleCode !== 'admin') {
    const { data: adminRole } = await admin.from('roles').select('id').eq('code', 'admin').single()
    const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', adminRole?.id)
    if ((count ?? 0) <= 1) return response({ error: 'ไม่สามารถลดบทบาทผู้ดูแลระบบคนสุดท้ายได้' }, 400)
  }

  const { error: profileError } = await admin.from('profiles').update({ full_name: fullName }).eq('id', targetId)
  if (profileError) return response({ error: 'แก้ไขโปรไฟล์ไม่สำเร็จ: ' + profileError.message }, 500)

  const { error: metadataError } = await admin.auth.admin.updateUserById(targetId, { user_metadata: { full_name: fullName } })
  if (metadataError) return response({ error: 'แก้ไขข้อมูลบัญชีไม่สำเร็จ: ' + metadataError.message }, 500)

  await admin.from('user_roles').delete().eq('user_id', targetId)
  const { error: assignmentError } = await admin.from('user_roles')
    .insert({ user_id: targetId, role_id: role.id, assigned_by: actorId })
  if (assignmentError) return response({ error: 'เปลี่ยนบทบาทไม่สำเร็จ: ' + assignmentError.message }, 500)

  return response({ ok: true })
}

async function setLeavePolicy(admin: any, actorId: string, body: any) {
  const targetId = String(body.user_id ?? '').trim()
  const policy = String(body.leave_policy ?? '').trim()
  const allowedPolicies = new Set(['teacher_civil_servant', 'government_employee', 'other'])
  if (!targetId || !allowedPolicies.has(policy)) return response({ error: 'ประเภทสิทธิการลาไม่ถูกต้อง' }, 400)

  const { data: target, error: targetError } = await admin.from('profiles').select('id,leave_policy').eq('id', targetId).maybeSingle()
  if (targetError || !target) return response({ error: 'ไม่พบโปรไฟล์ผู้ใช้งาน' }, 404)

  const { error } = await admin.from('profiles').update({ leave_policy: policy }).eq('id', targetId)
  if (error) return response({ error: 'บันทึกประเภทสิทธิการลาไม่สำเร็จ: ' + error.message }, 400)

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action: 'update',
    entity_type: 'profiles',
    entity_id: targetId,
    old_data: { leave_policy: target.leave_policy ?? 'other' },
    new_data: { leave_policy: policy },
  })
  if (auditError) console.error('leave policy audit log failed', auditError.message)

  return response({ ok: true, leave_policy: policy })
}

async function resetPassword(admin: any, actorId: string, body: any) {
  const targetId = String(body.user_id ?? '').trim()
  const password = String(body.password ?? '')
  if (!targetId) return response({ error: 'ไม่พบผู้ใช้งาน' }, 400)
  if (password.length < 6) return response({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400)

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetId)
  if (targetError || !target.user) return response({ error: 'ไม่พบผู้ใช้งานในระบบ Auth' }, 404)

  const { error } = await admin.auth.admin.updateUserById(targetId, { password })
  if (error) return response({ error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ: ' + error.message }, 400)

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: actorId,
    action: 'update',
    entity_type: 'auth_users',
    entity_id: targetId,
    old_data: { email: target.user.email ?? null },
    new_data: { action: 'admin_password_reset', email: target.user.email ?? null },
  })
  if (auditError) console.error('password reset audit log failed', auditError.message)

  return response({ ok: true })
}

async function deleteUser(admin: any, actorId: string, body: any) {
  const targetId = String(body.user_id ?? '')
  if (!targetId) return response({ error: 'ไม่พบผู้ใช้งาน' }, 400)
  if (targetId === actorId) return response({ error: 'ไม่สามารถลบบัญชีของตนเองได้' }, 400)

  const { data: targetRoles } = await admin.from('user_roles').select('roles!inner(code)').eq('user_id', targetId)
  const targetIsAdmin = (targetRoles ?? []).some((x: any) => x.roles?.code === 'admin')

  if (targetIsAdmin) {
    const { data: adminRole } = await admin.from('roles').select('id').eq('code', 'admin').single()
    const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', adminRole?.id)
    if ((count ?? 0) <= 1) return response({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้' }, 400)
  }

  const { error } = await admin.auth.admin.deleteUser(targetId)
  if (error) return response({ error: error.message }, 400)
  return response({ ok: true })
}

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const auth = await getAdminContext(req)
      if (!auth.ok) return response({ error: auth.message }, auth.status)

      const body = req.method === 'GET' ? { action: 'list' } : await req.json()
      if (body.action === 'list') return listUsers(auth.admin)
      if (body.action === 'invite') return inviteUser(auth.admin, auth.userId, body)
      if (body.action === 'update') return updateUser(auth.admin, auth.userId, body)
      if (body.action === 'reset_password') return resetPassword(auth.admin, auth.userId, body)
      if (body.action === 'set_leave_policy') return setLeavePolicy(auth.admin, auth.userId, body)
      if (body.action === 'delete') return deleteUser(auth.admin, auth.userId, body)
      return response({ error: 'ไม่รู้จักคำสั่ง' }, 400)
    } catch (error) {
      console.error('admin-users error', error)
      return response({ error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' }, 500)
    }
  },
}
