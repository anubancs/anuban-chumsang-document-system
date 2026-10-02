import { withSupabase } from 'npm:@supabase/server@^1'

const PRODUCTION_URL = 'https://anuban-chumsang-document-system.60010106nkw1.workers.dev'
const ALLOWED_ROLES = new Set(['admin', 'director', 'officer', 'staff'])

function response(data: unknown, status = 200) {
  return Response.json(data, { status })
}

async function requireUserManagement(ctx: any) {
  const userId = ctx.userClaims?.sub
  if (!userId) return { ok: false, status: 401, message: 'กรุณาเข้าสู่ระบบ' }

  const { data: userRoleRows, error: roleError } = await ctx.supabaseAdmin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (roleError) {
    console.error('role lookup failed', roleError)
    return { ok: false, status: 500, message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }
  }

  const roleIds = (userRoleRows ?? []).map((row: any) => row.role_id)
  if (!roleIds.length) return { ok: false, status: 403, message: 'ไม่มีสิทธิ์จัดการผู้ใช้งาน' }

  const { data: permissionRows, error: permissionError } = await ctx.supabaseAdmin
    .from('role_permissions')
    .select('role_id,permissions!inner(code)')
    .in('role_id', roleIds)

  if (permissionError) {
    console.error('permission lookup failed', permissionError)
    return { ok: false, status: 500, message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }
  }

  const allowed = (permissionRows ?? []).some((row: any) => row.permissions?.code === 'users.manage')
  if (!allowed) return { ok: false, status: 403, message: 'ไม่มีสิทธิ์จัดการผู้ใช้งาน' }
  return { ok: true, userId }
}

async function listUsers(ctx: any) {
  const { data: authData, error: authError } = await ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authError) return response({ error: authError.message }, 500)

  const users = authData.users ?? []
  if (!users.length) return response({ users: [] })

  const ids = users.map((u: any) => u.id)
  const [{ data: profiles, error: profileError }, { data: assignments, error: roleError }] = await Promise.all([
    ctx.supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids),
    ctx.supabaseAdmin.from('user_roles').select('user_id,roles!inner(code,name)').in('user_id', ids),
  ])

  if (profileError || roleError) {
    console.error('user data query failed', profileError ?? roleError)
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
      roles: roleMap.get(u.id) ?? [],
    })),
  })
}

async function inviteUser(ctx: any, body: any) {
  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const roleCode = String(body.role_code ?? 'staff').trim()

  if (!/^\S+@\S+\.\S+$/.test(email)) return response({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, 400)
  if (!fullName) return response({ error: 'กรุณาระบุชื่อผู้ใช้งาน' }, 400)
  if (!ALLOWED_ROLES.has(roleCode)) return response({ error: 'บทบาทไม่ถูกต้อง' }, 400)

  const { data, error } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: PRODUCTION_URL,
  })
  if (error || !data.user) return response({ error: error?.message ?? 'สร้างคำเชิญไม่สำเร็จ' }, 400)

  const { data: role, error: roleError } = await ctx.supabaseAdmin
    .from('roles').select('id,code,name').eq('code', roleCode).single()
  if (roleError || !role) return response({ error: 'ไม่พบบทบาทที่เลือก' }, 500)

  const { error: profileError } = await ctx.supabaseAdmin
    .from('profiles').upsert({ id: data.user.id, full_name: fullName, email }, { onConflict: 'id' })
  if (profileError) return response({ error: 'สร้างโปรไฟล์ไม่สำเร็จ: ' + profileError.message }, 500)

  const { error: assignmentError } = await ctx.supabaseAdmin
    .from('user_roles').upsert({ user_id: data.user.id, role_id: role.id, assigned_by: ctx.userClaims.sub }, { onConflict: 'user_id,role_id' })
  if (assignmentError) return response({ error: 'กำหนดบทบาทไม่สำเร็จ: ' + assignmentError.message }, 500)

  return response({ ok: true, user_id: data.user.id })
}

async function updateUser(ctx: any, body: any) {
  const userId = String(body.user_id ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const roleCode = String(body.role_code ?? '').trim()
  if (!userId || !fullName || !ALLOWED_ROLES.has(roleCode)) return response({ error: 'ข้อมูลไม่ครบถ้วน' }, 400)

  const { data: role, error: roleError } = await ctx.supabaseAdmin
    .from('roles').select('id,code').eq('code', roleCode).single()
  if (roleError || !role) return response({ error: 'ไม่พบบทบาทที่เลือก' }, 400)

  const { data: targetRoles } = await ctx.supabaseAdmin
    .from('user_roles').select('role_id,roles!inner(code)').eq('user_id', userId)

  const targetIsAdmin = (targetRoles ?? []).some((x: any) => x.roles?.code === 'admin')
  if (targetIsAdmin && roleCode !== 'admin') {
    const { data: adminRole } = await ctx.supabaseAdmin.from('roles').select('id').eq('code', 'admin').single()
    const { count } = await ctx.supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', adminRole?.id)
    if ((count ?? 0) <= 1) return response({ error: 'ไม่สามารถลดบทบาทผู้ดูแลระบบคนสุดท้ายได้' }, 400)
  }

  const { error: profileError } = await ctx.supabaseAdmin.from('profiles').update({ full_name: fullName }).eq('id', userId)
  if (profileError) return response({ error: 'แก้ไขโปรไฟล์ไม่สำเร็จ: ' + profileError.message }, 500)

  const { error: metadataError } = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { full_name: fullName } })
  if (metadataError) return response({ error: 'แก้ไขข้อมูลบัญชีไม่สำเร็จ: ' + metadataError.message }, 500)

  await ctx.supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
  const { error: assignmentError } = await ctx.supabaseAdmin
    .from('user_roles').insert({ user_id: userId, role_id: role.id, assigned_by: ctx.userClaims.sub })
  if (assignmentError) return response({ error: 'เปลี่ยนบทบาทไม่สำเร็จ: ' + assignmentError.message }, 500)

  return response({ ok: true })
}

async function deleteUser(ctx: any, body: any) {
  const userId = String(body.user_id ?? '')
  if (!userId) return response({ error: 'ไม่พบผู้ใช้งาน' }, 400)
  if (userId === ctx.userClaims.sub) return response({ error: 'ไม่สามารถลบบัญชีของตนเองได้' }, 400)

  const { data: targetRoles } = await ctx.supabaseAdmin.from('user_roles').select('roles!inner(code)').eq('user_id', userId)
  const targetIsAdmin = (targetRoles ?? []).some((x: any) => x.roles?.code === 'admin')

  if (targetIsAdmin) {
    const { data: adminRole } = await ctx.supabaseAdmin.from('roles').select('id').eq('code', 'admin').single()
    const { count } = await ctx.supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', adminRole?.id)
    if ((count ?? 0) <= 1) return response({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้' }, 400)
  }

  const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return response({ error: error.message }, 400)
  return response({ ok: true })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      const permission = await requireUserManagement(ctx)
      if (!permission.ok) return response({ error: permission.message }, permission.status)

      const body = req.method === 'GET' ? { action: 'list' } : await req.json()
      if (body.action === 'list') return listUsers(ctx)
      if (body.action === 'invite') return inviteUser(ctx, body)
      if (body.action === 'update') return updateUser(ctx, body)
      if (body.action === 'delete') return deleteUser(ctx, body)
      return response({ error: 'ไม่รู้จักคำสั่ง' }, 400)
    } catch (error) {
      console.error('admin-users error', error)
      return response({ error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' }, 500)
    }
  }),
}
