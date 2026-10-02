import './style.css'
import { supabase } from './lib/supabase'
import type { Profile } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!
type View = 'dashboard' | 'incoming' | 'outgoing' | 'tasks' | 'users'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
const today=()=>new Date().toISOString().slice(0,10)
const functionUrl='https://uwebbofczidcfnjbvsqu.supabase.co/functions/v1/drive-file'
const productionUrl='https://anuban-chumsang-document-system.60010106nkw1.workers.dev'
const authRedirectUrl=window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1'?window.location.origin:productionUrl
async function uploadDocumentFile(documentType:'incoming'|'outgoing',documentId:string,file:File){
  const m=document.querySelector('#file-message')!
  if(file.size>20*1024*1024){m.textContent='ไฟล์มีขนาดเกิน 20 MB';m.className='full error';return false}
  const body=new FormData()
  body.append('document_type',documentType)
  body.append('document_id',documentId)
  body.append('file',file)
  const {data:{session}}=await supabase.auth.getSession()
  if(!session){m.textContent='เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';m.className='full error';return false}
  try{
    const response=await fetch(functionUrl,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:'sb_publishable_3xMsRwdyNUhPsnJiH34O9w_hnF8BUiV'},body})
    const result=await response.json().catch(()=>({}))
    if(!response.ok||!result.ok){m.textContent='อัปโหลดไฟล์ไม่สำเร็จ: '+(result.message||'เกิดข้อผิดพลาด');m.className='full error';return false}
    m.textContent='อัปโหลดไฟล์ไป Google Drive สำเร็จ';m.className='full success';return true
  }catch(error){
    m.textContent='เชื่อมต่อ Google Drive ไม่สำเร็จ: '+(error instanceof Error?error.message:'เกิดข้อผิดพลาด');m.className='full error';return false
  }
}

async function loadProfile(id:string):Promise<Profile|null>{const {data}=await supabase.from('profiles').select('*').eq('id',id).maybeSingle();return data}

function renderLogin(message=''){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ระบบสารบรรณอิเล็กทรอนิกส์</h1><p class="muted">วัดทับกฤชกลาง</p><form id="login-form"><label>อีเมล<input id="email" type="email" required></label><label>รหัสผ่าน<input id="password" type="password" required></label><button>เข้าสู่ระบบ</button><p class="error">'+esc(message)+'</p></form><button id="forgot-password" class="link-btn" type="button">ลืมรหัสผ่าน?</button><p class="muted auth-note">การเพิ่มผู้ใช้งานใหม่ดำเนินการโดยผู้ดูแลระบบ</p></section></main>'
 document.querySelector<HTMLFormElement>('#login-form')!.onsubmit=async e=>{e.preventDefault();const email=(document.querySelector<HTMLInputElement>('#email')!).value;const password=(document.querySelector<HTMLInputElement>('#password')!).value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)renderLogin(error.message)}
 document.querySelector<HTMLButtonElement>('#forgot-password')!.onclick=async()=>{const current=(document.querySelector<HTMLInputElement>('#email')!).value.trim();const email=prompt('กรุณากรอกอีเมลสำหรับรีเซ็ตรหัสผ่าน',current)||'';if(!email)return;const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl});if(error){renderLogin('ส่งคำขอรีเซ็ตรหัสผ่านไม่สำเร็จ: '+error.message);return}alert('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมายและ Spam')}
}
function renderPasswordRecovery(){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ตั้งรหัสผ่านใหม่</h1><p class="muted">กำหนดรหัสผ่านใหม่สำหรับระบบสารบรรณ</p><form id="recovery-form"><label>รหัสผ่านใหม่<input id="new-password" type="password" minlength="6" required></label><label>ยืนยันรหัสผ่าน<input id="confirm-password" type="password" minlength="6" required></label><button>บันทึกรหัสผ่านใหม่</button><p id="recovery-message"></p></form></section></main>'
 document.querySelector<HTMLFormElement>('#recovery-form')!.onsubmit=async e=>{e.preventDefault();const password=(document.querySelector<HTMLInputElement>('#new-password')!).value;const confirm=(document.querySelector<HTMLInputElement>('#confirm-password')!).value;const m=document.querySelector('#recovery-message')!;if(password!==confirm){m.textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';m.className='error';return}const {error}=await supabase.auth.updateUser({password});if(error){m.textContent='เปลี่ยนรหัสผ่านไม่สำเร็จ: '+error.message;m.className='error';return}alert('เปลี่ยนรหัสผ่านสำเร็จ');await supabase.auth.signOut();renderLogin()}
}

async function saveDoc(kind:'incoming'|'outgoing',userId:string){
 const fd=new FormData(document.querySelector<HTMLFormElement>('#doc-form')!);
 const data=kind==='incoming'?{received_date:fd.get('date'),document_date:fd.get('documentDate')||null,subject:fd.get('subject'),sender:fd.get('sender')||null,priority:fd.get('priority'),status:'registered',description:fd.get('description')||null,created_by:userId}:{document_date:fd.get('date'),subject:fd.get('subject'),recipient:fd.get('recipient')||null,priority:fd.get('priority'),description:fd.get('description')||null,created_by:userId};
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents';const {data:created,error}=await supabase.from(table).insert(data).select('id,document_no').single();
 const m=document.querySelector('#form-message')!;
 if(error){m.textContent='บันทึกไม่สำเร็จ: '+error.message;m.className='error success-area';return}
 const file=document.querySelector<HTMLInputElement>('#doc-file')?.files?.[0]
 if(file){
   const uploaded=await uploadDocumentFile(kind,created.id,file)
   if(!uploaded){m.textContent='บันทึกทะเบียนแล้ว แต่ไฟล์ยังอัปโหลดไม่สำเร็จ กรุณาตรวจสอบข้อความด้านบน';m.className='error success-area';return}
 }
 m.textContent=file?'บันทึกทะเบียน '+created.document_no+' และไฟล์เรียบร้อย':'บันทึกทะเบียน '+created.document_no+' เรียบร้อย';m.className='success success-area';(document.querySelector<HTMLFormElement>('#doc-form')!).reset()
}

async function documentForm(kind:'incoming'|'outgoing',userId:string){
 const incoming=kind==='incoming';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><main class="page"><button id="back" class="link-btn">← กลับหน้าหลัก</button><section class="panel form-panel"><h1>'+ (incoming?'ลงทะเบียนหนังสือรับ':'ลงทะเบียนหนังสือส่ง') +'</h1><p class="muted">เลขทะเบียนจะถูกสร้างอัตโนมัติ</p><form id="doc-form" class="form-grid"><label>วันที่<input name="date" type="date" value="'+today()+'" required></label>'+(incoming?'<label>วันที่หนังสือ<input name="documentDate" type="date"></label>':'')+'<label>เรื่อง<input name="subject" required></label><label>'+(incoming?'ผู้ส่ง':'ผู้รับ')+'<input name="'+(incoming?'sender':'recipient')+'"></label><label>ความเร่งด่วน<select name="priority"><option value="normal">ปกติ</option><option value="urgent">ด่วน</option><option value="very_urgent">ด่วนมาก</option></select></label><label class="full">รายละเอียด<textarea name="description" rows="5"></textarea></label><label class="full">ไฟล์เอกสาร<input id="doc-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"></label><p id="file-message" class="full muted">ไฟล์จะถูกอัปโหลดไปยัง Google Drive เมื่อบันทึกทะเบียน</p><div class="full actions"><button>บันทึก</button></div><p id="form-message" class="full"></p></form></section></main></div>'
 document.querySelector('#back')!.addEventListener('click',()=>renderDashboard(userId,'dashboard'));document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelector<HTMLFormElement>('#doc-form')!.onsubmit=async e=>{e.preventDefault();await saveDoc(kind,userId)}
}

function listRows(rows:any[],dateField:string,kind?:'incoming'|'outgoing'){return rows.map(d=>'<div class="table-row '+(kind?'clickable':'')+'" '+(kind?'data-doc-kind="'+kind+'" data-doc-id="'+esc(d.id)+'"':'')+'><span>'+esc(d.document_no)+'</span><span>'+esc(d[dateField])+'</span><span>'+esc(d.subject)+'</span><span>'+esc(d.status)+'</span></div>').join('')||'<p class="muted">ยังไม่มีรายการ</p>'}
async function showDocument(kind:'incoming'|'outgoing',id:string,userId:string){
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents'
 const {data:d,error}=await supabase.from(table).select('*').eq('id',id).single()
 if(error||!d){alert('ไม่พบข้อมูลเอกสาร');return}
 const fk=kind==='incoming'?'incoming_document_id':'outgoing_document_id'
 const {data:files}=await supabase.from('document_files').select('*').eq(fk,id).order('created_at',{ascending:false})
 const {data:assignments}=await supabase.from('assignments').select('id,assigned_to,due_date,status,note').eq(fk,id).order('created_at',{ascending:false})
 const {data:people}=await supabase.from('profiles').select('id,full_name').order('full_name')
 const peopleMap=new Map((people||[]).map((p:any)=>[p.id,p.full_name]))
 const fileHtml=(files||[]).map((f:any)=>'<div class="row"><span>📎 '+esc(f.file_name)+'</span>'+(f.drive_web_url?'<a target="_blank" rel="noreferrer" href="'+esc(f.drive_web_url)+'">เปิดไฟล์</a>':'<small>รอเชื่อม Google Drive</small>')+'</div>').join('')||'<p class="muted">ยังไม่มีไฟล์</p>'
 const taskHtml=(assignments||[]).map((a:any)=>'<div class="row"><span>'+esc(peopleMap.get(a.assigned_to)||a.assigned_to)+'</span><span>'+esc(a.due_date||'-')+'</span><span><select data-task-status="'+esc(a.id)+'"><option value="pending">รอดำเนินการ</option><option value="accepted">รับงานแล้ว</option><option value="in_progress">กำลังดำเนินการ</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิก</option></select></span><button class="secondary small" data-task-save="'+esc(a.id)+'">บันทึก</button></div>').join('')||'<p class="muted">ยังไม่มีการมอบหมาย</p>'
 const options=(people||[]).map((p:any)=>'<option value="'+esc(p.id)+'">'+esc(p.full_name||p.id)+'</option>').join('')
 app.innerHTML='<div class="modal-backdrop"><section class="modal panel"><button id="close-detail" class="secondary">ปิด</button><h1>'+esc(d.document_no)+'</h1><p><strong>เรื่อง:</strong> '+esc(d.subject)+'</p><div class="detail-grid"><div><strong>วันที่:</strong> '+esc(kind==='incoming'?d.received_date:d.document_date)+'</div><div><strong>สถานะ:</strong> '+esc(d.status)+'</div><div><strong>'+(kind==='incoming'?'ผู้ส่ง':'ผู้รับ')+':</strong> '+esc(kind==='incoming'?d.sender:d.recipient)+'</div><div><strong>ความเร่งด่วน:</strong> '+esc(d.priority)+'</div></div><p>'+esc(d.description||'')+'</p>'+(kind==='incoming'?'<div class="panel"><h2>สถานะเอกสาร</h2><div class="actions"><select id="doc-status"><option value="received">รับเรื่อง</option><option value="registered">ลงทะเบียนแล้ว</option><option value="assigned">มอบหมายแล้ว</option><option value="in_progress">กำลังดำเนินการ</option><option value="completed">เสร็จสิ้น</option><option value="archived">จัดเก็บ</option><option value="cancelled">ยกเลิก</option></select><button id="save-doc-status">บันทึก</button></div></div>':'<div class="panel"><h2>สถานะเอกสาร</h2><div class="actions"><select id="doc-status"><option value="draft">ร่าง</option><option value="pending_approval">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="sent">ส่งแล้ว</option><option value="archived">จัดเก็บ</option><option value="cancelled">ยกเลิก</option></select><button id="save-doc-status">บันทึก</button></div></div>')+'<div class="panel"><h2>ไฟล์แนบ</h2>'+fileHtml+'</div><div class="panel"><h2>งานที่มอบหมาย</h2>'+taskHtml+'<hr><form id="assign-form" class="form-grid"><label>ผู้รับผิดชอบ<select name="assigned_to" required><option value="">เลือกผู้รับผิดชอบ</option>'+options+'</select></label><label>กำหนดส่ง<input name="due_date" type="date"></label><label class="full">หมายเหตุ<textarea name="note" rows="2"></textarea></label><div class="full"><button>มอบหมายงาน</button></div></form></div></section></div>'
 ;(document.querySelector<HTMLSelectElement>('#doc-status')!).value=d.status
 document.querySelector('#close-detail')!.addEventListener('click',()=>renderDashboard(userId,kind))
 document.querySelector('#save-doc-status')!.addEventListener('click',async()=>{const status=(document.querySelector<HTMLSelectElement>('#doc-status')!).value;const {error}=await supabase.from(table).update({status}).eq('id',id);if(error)alert('เปลี่ยนสถานะไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)})
 document.querySelector<HTMLFormElement>('#assign-form')!.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload:any={assigned_to:fd.get('assigned_to'),assigned_by:userId,due_date:fd.get('due_date')||null,note:fd.get('note')||null,status:'pending'};payload[fk]=id;const {error}=await supabase.from('assignments').insert(payload);if(error)alert('มอบหมายไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)}
 document.querySelectorAll<HTMLButtonElement>('[data-task-save]').forEach(b=>b.onclick=async()=>{const taskId=b.dataset.taskSave!;const select=document.querySelector<HTMLSelectElement>('[data-task-status="'+taskId+'"]')!;const {error}=await supabase.from('assignments').update({status:select.value}).eq('id',taskId);if(error)alert('อัปเดตงานไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)});document.querySelectorAll<HTMLSelectElement>('[data-task-status]').forEach(sel=>{sel.value=(assignments||[]).find((a:any)=>a.id===sel.dataset.taskStatus)?.status||'pending'})
}

async function functionErrorMessage(error:any){
  if(error?.context?.json){
    try{
      const body=await error.context.json()
      if(body?.error)return String(body.error)
      if(body?.message)return String(body.message)
    }catch{}
  }
  return error?.message||'เกิดข้อผิดพลาด'
}

async function invokeAdminUsers(body:any){
  let {data:{session}}=await supabase.auth.getSession()
  if(!session){
    const refreshed=await supabase.auth.refreshSession()
    session=refreshed.data.session
  }
  if(!session)return {data:null,error:new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')}
  return supabase.functions.invoke('admin-users',{
    body,
    headers:{Authorization:'Bearer '+session.access_token},
  })
}

async function renderUsers(userId:string){
 const {data,error}=await invokeAdminUsers({action:'list'})
 if(error||!data){alert('โหลดผู้ใช้งานไม่สำเร็จ: '+await functionErrorMessage(error));return}
 const users=(data.users||[]) as any[]
 const roleLabel=(code:string)=>({admin:'ผู้ดูแลระบบ',director:'ผู้อำนวยการ',officer:'เจ้าหน้าที่สารบรรณ',staff:'ผู้ใช้งาน'})[code]||code
 const rows=users.map(u=>{
   const role=u.roles?.[0]?.code||'staff'
   return '<tr><td>'+esc(u.full_name||'-')+'</td><td>'+esc(u.email||'-')+'</td><td>'+esc(roleLabel(role))+'</td><td>'+ (u.confirmed?'ยืนยันแล้ว':'รอยืนยัน') +'</td><td><button class="secondary small" data-edit-user="'+esc(u.id)+'">แก้ไข</button> <button class="secondary small" data-delete-user="'+esc(u.id)+'">ลบ</button></td></tr>'
 }).join('')||'<tr><td colspan="5" class="muted">ยังไม่มีผู้ใช้งาน</td></tr>'
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-user-nav="dashboard">ภาพรวม</button><button data-user-nav="incoming">หนังสือรับ</button><button data-user-nav="outgoing">หนังสือส่ง</button><button data-user-nav="tasks">งานของฉัน</button><hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button><button class="active" data-user-nav="users">ผู้ใช้งาน</button></aside><main class="page"><section class="welcome"><h1>จัดการผู้ใช้งาน</h1><p class="muted">เพิ่ม แก้ไขบทบาท และลบบัญชีผู้ใช้งาน</p></section><section class="panel"><form id="invite-user-form" class="form-grid"><label>ชื่อผู้ใช้งาน<input name="full_name" required></label><label>อีเมล<input name="email" type="email" required></label><label>บทบาท<select name="role_code"><option value="staff">ผู้ใช้งาน</option><option value="officer">เจ้าหน้าที่สารบรรณ</option><option value="director">ผู้อำนวยการ</option><option value="admin">ผู้ดูแลระบบ</option></select></label><div class="actions"><button>ส่งคำเชิญ</button></div></form><p id="users-message"></p></section><section class="panel"><div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>'+rows+'</tbody></table></div></section></main></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelectorAll<HTMLButtonElement>('[data-user-nav]').forEach(b=>b.onclick=()=>renderDashboard(userId,b.dataset.userNav as View))
 document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId))
 document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId))
 document.querySelector<HTMLFormElement>('#invite-user-form')!.onsubmit=async e=>{
   e.preventDefault()
   const fd=new FormData(e.currentTarget)
   const m=document.querySelector('#users-message')!
   const {error}=await invokeAdminUsers({action:'invite',full_name:fd.get('full_name'),email:fd.get('email'),role_code:fd.get('role_code')})
   if(error){m.textContent='ส่งคำเชิญไม่สำเร็จ: '+await functionErrorMessage(error);m.className='error';return}
   m.textContent='ส่งคำเชิญเรียบร้อย ผู้ใช้งานจะได้รับอีเมลเพื่อเข้าระบบ';m.className='success'
   e.currentTarget.reset()
   setTimeout(()=>renderUsers(userId),800)
 }
 document.querySelectorAll<HTMLButtonElement>('[data-edit-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.editUser);if(!u)return
   const fullName=prompt('ชื่อผู้ใช้งาน',u.full_name||'');if(fullName===null)return
   const current=u.roles?.[0]?.code||'staff'
   const roleCode=prompt('บทบาท: admin / director / officer / staff',current);if(roleCode===null)return
   const {error}=await invokeAdminUsers({action:'update',user_id:u.id,full_name:fullName,role_code:roleCode})
   if(error)alert('แก้ไขไม่สำเร็จ: '+await functionErrorMessage(error));else await renderUsers(userId)
 })
 document.querySelectorAll<HTMLButtonElement>('[data-delete-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.deleteUser);if(!u)return
   if(!confirm('ยืนยันการลบบัญชี '+(u.full_name||u.email)+' ?'))return
   const {error}=await invokeAdminUsers({action:'delete',user_id:u.id})
   if(error)alert('ลบผู้ใช้งานไม่สำเร็จ: '+await functionErrorMessage(error));else await renderUsers(userId)
 })
}

async function renderDocumentList(kind:'incoming'|'outgoing',userId:string,search=''){
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents'
 const dateField=kind==='incoming'?'received_date':'document_date'
 const title=kind==='incoming'?'หนังสือรับ':'หนังสือส่ง'
 let query=supabase.from(table).select('id,document_no,'+dateField+',subject,status')
 if(search.trim()){
   const q=search.trim().replace(/[%_]/g,'')
   query=query.or('document_no.ilike.%'+q+'%,subject.ilike.%'+q+'%')
 }
 const {data,error}=await query.order(dateField,{ascending:false}).limit(100)
 if(error){alert('โหลด'+title+'ไม่สำเร็จ: '+error.message);return}
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-list-nav="dashboard">ภาพรวม</button><button class="active" data-list-nav="'+kind+'">'+title+'</button><button data-list-nav="'+(kind==='incoming'?'outgoing':'incoming')+'">'+(kind==='incoming'?'หนังสือส่ง':'หนังสือรับ')+'</button><button data-list-nav="tasks">งานของฉัน</button><hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button></aside><main class="page"><section class="welcome"><h1>'+title+'</h1><div class="toolbar"><input id="document-search" placeholder="ค้นหาเลขทะเบียนหรือชื่อเรื่อง" value="'+esc(search)+'"><button id="search-document">ค้นหา</button><button id="new-document">＋ ลงทะเบียน'+title+'</button></div></section><section class="panel"><div class="table-head"><b>เลขทะเบียน</b><b>วันที่</b><b>เรื่อง</b><b>สถานะ</b></div>'+listRows(data||[],dateField,kind)+'</section></main></div></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelectorAll<HTMLButtonElement>('[data-list-nav]').forEach(b=>b.onclick=()=>{const v=b.dataset.listNav as View;if(v==='incoming'||v==='outgoing')renderDocumentList(v,userId);else renderDashboard(userId,v)})
 document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId))
 document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId))
 document.querySelector('#new-document')!.addEventListener('click',()=>documentForm(kind,userId))
 const doSearch=()=>renderDocumentList(kind,userId,(document.querySelector<HTMLInputElement>('#document-search')!).value)
 document.querySelector('#search-document')!.addEventListener('click',doSearch)
 document.querySelector<HTMLInputElement>('#document-search')!.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch()}})
 document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.docKind as 'incoming'|'outgoing',el.dataset.docId!,userId)))
}

async function renderDashboard(userId:string,view:View='dashboard'){
 if(view==='users'){await renderUsers(userId);return}
 if(view==='incoming'||view==='outgoing'){await renderDocumentList(view,userId);return}
 const [p,inc,out,tasks,roles]=await Promise.all([
  loadProfile(userId),
  supabase.from('incoming_documents').select('id,document_no,received_date,subject,status').order('received_date',{ascending:false}).limit(10),
  supabase.from('outgoing_documents').select('id,document_no,document_date,subject,status').order('document_date',{ascending:false}).limit(10),
  supabase.from('assignments').select('id,incoming_document_id,outgoing_document_id,due_date,status,note,incoming_documents(document_no,subject),outgoing_documents(document_no,subject)').eq('assigned_to',userId).neq('status','completed').order('due_date').limit(20),
  supabase.from('user_roles').select('roles(name)').eq('user_id',userId)
 ])
 const role=(roles.data?.[0] as any)?.roles?.name||'ผู้ใช้งาน'
 let content=''
 if(view==='dashboard')content='<section class="welcome"><h1>สวัสดี '+esc(p?.full_name||'ผู้ใช้งาน')+'</h1><p class="muted">บทบาท: '+esc(role)+'</p></section><section class="stats"><article><span>หนังสือรับล่าสุด</span><strong>'+ (inc.data?.length||0) +'</strong></article><article><span>หนังสือส่งล่าสุด</span><strong>'+ (out.data?.length||0) +'</strong></article><article><span>งานค้าง</span><strong>'+ (tasks.data?.length||0) +'</strong></article></section><section class="grid"><article class="panel"><h2>หนังสือรับล่าสุด</h2>'+listRows(inc.data||[],'received_date','incoming')+'</article><article class="panel"><h2>หนังสือส่งล่าสุด</h2>'+listRows(out.data||[],'document_date','outgoing')+'</article></section>'
 if(view==='tasks')content='<section class="welcome"><h1>งานของฉัน</h1><p class="muted">งานที่ยังไม่เสร็จ</p></section><section class="panel">'+((tasks.data||[]).map((d:any)=>{const doc=d.incoming_documents||d.outgoing_documents;const kind=d.incoming_document_id?'incoming':'outgoing';return '<div class="row clickable" data-task-doc="'+esc(d.incoming_document_id||d.outgoing_document_id||'')+'" data-task-kind="'+kind+'"><b>'+esc(d.due_date||'-')+'</b><span>'+esc(doc?.document_no||'')+' — '+esc(doc?.subject||d.note||'งานเอกสาร')+'</span><small>'+esc(d.status)+'</small></div>'}).join('')||'<p class="muted">ไม่มีงานค้าง</p>')+'</section>'
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-view="dashboard">ภาพรวม</button><button data-view="incoming">หนังสือรับ</button><button data-view="outgoing">หนังสือส่ง</button><button data-view="tasks">งานของฉัน</button>'+(role==='ผู้ดูแลระบบ'?'<button data-view="users">ผู้ใช้งาน</button>':'')+'<hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button></aside><main class="page">'+content+'</main></div></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>renderDashboard(userId,b.dataset.view as View))
 document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId))
 document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId))
 document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.docKind as 'incoming'|'outgoing',el.dataset.docId!,userId)))
 document.querySelectorAll<HTMLElement>('[data-task-doc]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.taskKind as 'incoming'|'outgoing',el.dataset.taskDoc!,userId)))
}


async function boot(){supabase.auth.onAuthStateChange(async(event,s)=>{if(event==='PASSWORD_RECOVERY'){renderPasswordRecovery();return}if(s?.user){await renderDashboard(s.user.id)}else renderLogin()});const {data:{session}}=await supabase.auth.getSession();if(session?.user)await renderDashboard(session.user.id);else renderLogin()}
boot()