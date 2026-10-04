import './style.css'
import { supabase } from './lib/supabase'
import type { Profile } from './types'
import { renderUserImport } from './user-import'

const app = document.querySelector<HTMLDivElement>('#app')!
type View = 'dashboard' | 'incoming' | 'outgoing' | 'tasks' | 'leave' | 'users' | 'audit'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
const today=()=>new Date().toISOString().slice(0,10)
const functionUrl='https://uwebbofczidcfnjbvsqu.supabase.co/functions/v1/drive-file'
const deleteFunctionUrl='https://uwebbofczidcfnjbvsqu.supabase.co/functions/v1/delete-document'
const productionUrl='https://anuban-chumsang-document-system.60010106nkw1.workers.dev'
const authRedirectUrl=window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1'?window.location.origin:productionUrl
const PAGE_SIZE=50
function renderLoading(message='กำลังโหลดข้อมูล...'){app.innerHTML='<main class="page"><section class="panel"><p class="muted">'+esc(message)+'</p></section></main>'}
function renderLoadError(message:string,retry:()=>void){app.innerHTML='<main class="page"><section class="panel"><h2>ไม่สามารถโหลดข้อมูลได้</h2><p class="error">'+esc(message)+'</p><button id="retry-load">ลองใหม่</button></section></main>';document.querySelector('#retry-load')!.addEventListener('click',retry)}
function setBusy(button:HTMLButtonElement,busy:boolean,label='กำลังดำเนินการ...'){button.disabled=busy;if(busy){button.dataset.originalText=button.textContent||'';button.textContent=label}else if(button.dataset.originalText){button.textContent=button.dataset.originalText;delete button.dataset.originalText}}
async function uploadDocumentFiles(documentType:'incoming'|'outgoing',documentId:string,files:File[]){
  const m=document.querySelector('#file-message')!
  if(!files.length)return true
  const oversized=files.find(file=>file.size>20*1024*1024)
  if(oversized){m.textContent='ไฟล์ '+oversized.name+' มีขนาดเกิน 20 MB';m.className='full error';return false}
  const body=new FormData()
  body.append('document_type',documentType)
  body.append('document_id',documentId)
  files.forEach(file=>body.append('file',file))
  const {data:{session}}=await supabase.auth.getSession()
  if(!session){m.textContent='เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';m.className='full error';return false}
  try{
    m.textContent='กำลังอัปโหลด '+files.length+' ไฟล์ไปยัง Google Drive...';m.className='full muted'
    const response=await fetch(functionUrl,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||''},body})
    const result=await response.json().catch(()=>({}))
    if(!response.ok||!result.ok){m.textContent='อัปโหลดไฟล์ไม่สำเร็จ: '+(result.error||result.message||'เกิดข้อผิดพลาด');m.className='full error';return false}
    m.textContent='อัปโหลดไฟล์แนบ '+files.length+' ไฟล์ไป Google Drive สำเร็จ';m.className='full success';return true
  }catch(error){
    m.textContent='เชื่อมต่อ Google Drive ไม่สำเร็จ: '+(error instanceof Error?error.message:'เกิดข้อผิดพลาด');m.className='full error';return false
  }
}

async function loadProfile(id:string):Promise<Profile|null>{const {data}=await supabase.from('profiles').select('*').eq('id',id).maybeSingle();return data}
const ROLE_PERMISSIONS:Record<string,string[]>={
 admin:['documents.read','documents.create','documents.update','documents.delete','documents.assign','documents.approve','leave.approve','users.manage','settings.manage'],
 director:['documents.read','documents.create','documents.update','documents.assign','documents.approve','leave.approve'],
 deputy_director:['documents.read','documents.create','documents.update','documents.assign','documents.approve','leave.approve'],
 officer:['documents.read','documents.create','documents.update','documents.assign'],
 staff:['documents.read','documents.create','documents.update'],
}
async function getUserPermissions(userId:string){
 const {data}=await supabase.from('user_roles').select('roles(code)').eq('user_id',userId)
 const codes=(data||[]).flatMap((r:any)=>ROLE_PERMISSIONS[r.roles?.code||'']||[])
 return new Set(codes)
}
function hasPermission(permissions:Set<string>,code:string){return permissions.has(code)}

function renderLogin(message=''){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ระบบสารบรรณอิเล็กทรอนิกส์</h1><p class="muted">วัดทับกฤชกลาง</p><form id="login-form"><label>อีเมล<input id="email" type="email" required></label><label>รหัสผ่าน<input id="password" type="password" required></label><button>เข้าสู่ระบบ</button><p class="error">'+esc(message)+'</p></form><button id="forgot-password" class="link-btn" type="button">ลืมรหัสผ่าน?</button><p class="muted auth-note">การเพิ่มผู้ใช้งานใหม่ดำเนินการโดยผู้ดูแลระบบ</p></section></main>'
 document.querySelector<HTMLFormElement>('#login-form')!.onsubmit=async e=>{e.preventDefault();const email=(document.querySelector<HTMLInputElement>('#email')!).value;const password=(document.querySelector<HTMLInputElement>('#password')!).value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)renderLogin(error.message)}
 document.querySelector<HTMLButtonElement>('#forgot-password')!.onclick=async()=>{const current=(document.querySelector<HTMLInputElement>('#email')!).value.trim();const email=prompt('กรุณากรอกอีเมลสำหรับรีเซ็ตรหัสผ่าน',current)||'';if(!email)return;const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl+'?type=recovery'});if(error){renderLogin('ส่งคำขอรีเซ็ตรหัสผ่านไม่สำเร็จ: '+error.message);return}alert('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมายและ Spam')}
}
function isInviteSession(){const hashType=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type');const queryType=new URLSearchParams(window.location.search).get('type');return hashType==='invite'||queryType==='invite'}
function isRecoverySession(){const hashType=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('type');const queryType=new URLSearchParams(window.location.search).get('type');return hashType==='recovery'||queryType==='recovery'}
function renderSetInitialPassword(){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ตั้งรหัสผ่านสำหรับการใช้งานครั้งแรก</h1><p class="muted">กรุณากำหนดรหัสผ่านของคุณก่อนเริ่มใช้งานระบบสารบรรณ</p><form id="initial-password-form"><label>รหัสผ่านใหม่<input id="initial-password" type="password" minlength="6" autocomplete="new-password" required></label><label>ยืนยันรหัสผ่าน<input id="initial-password-confirm" type="password" minlength="6" autocomplete="new-password" required></label><button>ตั้งรหัสผ่านและเข้าสู่ระบบ</button><p id="initial-password-message"></p></form></section></main>'
 document.querySelector<HTMLFormElement>('#initial-password-form')!.onsubmit=async e=>{e.preventDefault();const password=(document.querySelector<HTMLInputElement>('#initial-password')!).value;const confirm=(document.querySelector<HTMLInputElement>('#initial-password-confirm')!).value;const m=document.querySelector('#initial-password-message')!;if(password!==confirm){m.textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';m.className='error';return}const button=document.querySelector<HTMLButtonElement>('#initial-password-form button')!;setBusy(button,true,'กำลังบันทึกรหัสผ่าน...');const {data:currentUser}=await supabase.auth.getUser();const {error}=await supabase.auth.updateUser({password,data:{...(currentUser.user?.user_metadata||{}),must_change_password:false}});setBusy(button,false);if(error){m.textContent='ตั้งรหัสผ่านไม่สำเร็จ: '+error.message;m.className='error';return}history.replaceState({},document.title,window.location.pathname+window.location.search);m.textContent='ตั้งรหัสผ่านสำเร็จ กำลังเข้าสู่ระบบ...';m.className='success';await renderDashboard((await supabase.auth.getUser()).data.user!.id)}
}
function renderPasswordRecovery(){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ตั้งรหัสผ่านใหม่</h1><p class="muted">กำหนดรหัสผ่านใหม่สำหรับระบบสารบรรณ</p><form id="recovery-form"><label>รหัสผ่านใหม่<input id="new-password" type="password" minlength="6" required></label><label>ยืนยันรหัสผ่าน<input id="confirm-password" type="password" minlength="6" required></label><button>บันทึกรหัสผ่านใหม่</button><p id="recovery-message"></p></form></section></main>'
 document.querySelector<HTMLFormElement>('#recovery-form')!.onsubmit=async e=>{e.preventDefault();const password=(document.querySelector<HTMLInputElement>('#new-password')!).value;const confirm=(document.querySelector<HTMLInputElement>('#confirm-password')!).value;const m=document.querySelector('#recovery-message')!;if(password!==confirm){m.textContent='รหัสผ่านทั้งสองช่องไม่ตรงกัน';m.className='error';return}const {error}=await supabase.auth.updateUser({password});if(error){m.textContent='เปลี่ยนรหัสผ่านไม่สำเร็จ: '+error.message;m.className='error';return}alert('เปลี่ยนรหัสผ่านสำเร็จ');await supabase.auth.signOut();renderLogin()}
}

async function saveDoc(kind:'incoming'|'outgoing',userId:string){
 const fd=new FormData(document.querySelector<HTMLFormElement>('#doc-form')!);
 const data=kind==='incoming'?{received_date:fd.get('date'),document_date:fd.get('documentDate')||null,sender_document_no:fd.get('senderDocumentNo')||null,subject:fd.get('subject'),sender:fd.get('sender')||null,priority:fd.get('priority'),handling_type:fd.get('handlingType')||'assignment',status:'registered',description:fd.get('description')||null,created_by:userId}:{document_date:fd.get('date'),subject:fd.get('subject'),recipient:fd.get('recipient')||null,priority:fd.get('priority'),description:fd.get('description')||null,created_by:userId};
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents';const {data:created,error}=await supabase.from(table).insert(data).select('id,document_no').single();
 const m=document.querySelector('#form-message')!;
 if(error){m.textContent='บันทึกไม่สำเร็จ: '+error.message;m.className='error success-area';return}
 const files=Array.from(document.querySelector<HTMLInputElement>('#doc-file')?.files||[])
 if(files.length){
   const uploaded=await uploadDocumentFiles(kind,created.id,files)
   if(!uploaded){m.textContent='บันทึกทะเบียนแล้ว แต่ไฟล์แนบบางส่วน/ทั้งหมดอัปโหลดไม่สำเร็จ กรุณาตรวจสอบข้อความด้านบน';m.className='error success-area';return}
 }
 m.textContent=files.length?'บันทึกทะเบียน '+created.document_no+' และไฟล์แนบ '+files.length+' ไฟล์เรียบร้อย':'บันทึกทะเบียน '+created.document_no+' เรียบร้อย';m.className='success success-area';(document.querySelector<HTMLFormElement>('#doc-form')!).reset()
}

async function documentForm(kind:'incoming'|'outgoing',userId:string){
 const permissions=await getUserPermissions(userId)
 if(!hasPermission(permissions,'documents.create')){alert('คุณไม่มีสิทธิ์ลงทะเบียนเอกสาร');return}
 const incoming=kind==='incoming';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><main class="page"><button id="back" class="link-btn">← กลับหน้าหลัก</button><section class="panel form-panel"><h1>'+ (incoming?'ลงทะเบียนหนังสือรับ':'ลงทะเบียนหนังสือส่ง') +'</h1><p class="muted">เลขทะเบียนจะถูกสร้างอัตโนมัติ</p><form id="doc-form" class="form-grid"><label>วันที่<input name="date" type="date" value="'+today()+'" required></label>'+(incoming?'<label>วันที่หนังสือ<input name="documentDate" type="date"></label><label>เลขที่หนังสือจากหน่วยงานผู้ส่ง<input name="senderDocumentNo" placeholder="เช่น ศธ 04073/1234"></label>':'')+'<label>เรื่อง<input name="subject" required></label><label>'+(incoming?'ผู้ส่ง':'ผู้รับ')+'<input name="'+(incoming?'sender':'recipient')+'"></label><label>ความเร่งด่วน<select name="priority"><option value="normal">ปกติ</option><option value="urgent">ด่วน</option><option value="very_urgent">ด่วนมาก</option></select></label><label class="full">รายละเอียด<textarea name="description" rows="5"></textarea></label><label class="full">ไฟล์เอกสาร<input id="doc-file" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"></label><p id="file-message" class="full muted">ไฟล์จะถูกอัปโหลดไปยัง Google Drive เมื่อบันทึกทะเบียน</p><div class="full actions"><button>บันทึก</button></div><p id="form-message" class="full"></p></form></section></main></div>'
 document.querySelector('#back')!.addEventListener('click',()=>renderDashboard(userId,'dashboard'));document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelector<HTMLFormElement>('#doc-form')!.onsubmit=async e=>{e.preventDefault();const submit=e.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"],button');if(submit)setBusy(submit,true,'กำลังบันทึก...');try{await saveDoc(kind,userId)}finally{if(submit)setBusy(submit,false)}}
}

function listRows(rows:any[],dateField:string,kind?:'incoming'|'outgoing'){return rows.map(d=>'<div class="table-row '+(kind?'clickable':'')+'" '+(kind?'data-doc-kind="'+kind+'" data-doc-id="'+esc(d.id)+'"':'')+'><span>'+esc(d.document_no)+'</span><span>'+esc(d[dateField])+'</span>'+(kind==='incoming'?'<span>'+esc(d.sender_document_no||'-')+'</span>':'')+'<span>'+esc(d.subject)+'</span><span>'+esc(d.status)+'</span></div>').join('')||'<p class="muted">ยังไม่มีรายการ</p>'}
async function showDocument(kind:'incoming'|'outgoing',id:string,userId:string){
 const permissions=await getUserPermissions(userId)
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents'
 const {data:d,error}=await supabase.from(table).select('*').eq('id',id).single()
 if(error||!d){alert('ไม่พบข้อมูลเอกสาร');return}
 const fk=kind==='incoming'?'incoming_document_id':'outgoing_document_id'
 const {data:files}=await supabase.from('document_files').select('*').eq(fk,id).order('created_at',{ascending:false})
 const {data:assignments}=await supabase.from('assignments').select('id,assigned_to,due_date,status,note').eq(fk,id).order('created_at',{ascending:false})
 const {data:workflow}=await supabase.from('workflows').select('id,from_status,to_status,action,actor_id,comment,created_at').eq(fk,id).order('created_at',{ascending:false}).limit(50)
 const [{data:people},{data:currentProfile}]=await Promise.all([supabase.from('profiles').select('id,full_name,position,is_active,department_id').order('full_name'),supabase.from('profiles').select('id,department_id').eq('id',userId).maybeSingle()])
 const peopleMap=new Map((people||[]).map((p:any)=>[p.id,p.full_name]))
 const fileHtml=(files||[]).map((f:any)=>'<div class="row"><span>📎 '+esc(f.file_name)+'</span>'+(f.drive_web_url?'<a target="_blank" rel="noreferrer" href="'+esc(f.drive_web_url)+'">เปิดไฟล์</a>':'<small>รอเชื่อม Google Drive</small>')+'</div>').join('')||'<p class="muted">ยังไม่มีไฟล์</p>'
 const workflowHtml='<div class="panel"><h2>ประวัติ Workflow</h2>'+((workflow||[]).map((w:any)=>'<div class="row"><span>'+esc(new Date(w.created_at).toLocaleString('th-TH'))+'</span><span>'+esc(w.from_status||'เริ่มต้น')+' → '+esc(w.to_status)+'</span><small>'+esc(w.action)+' · '+esc(peopleMap.get(w.actor_id)||w.actor_id)+'</small></div>').join('')||'<p class="muted">ยังไม่มีประวัติ</p>')+'</div>';const incomingTransitions:any={received:['registered','assigned','in_progress','cancelled'],registered:['assigned','in_progress','cancelled'],assigned:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:['archived'],archived:[],cancelled:[]};const outgoingTransitions:any={draft:['pending_approval','cancelled'],pending_approval:['approved','cancelled'],approved:['sent','cancelled'],sent:['archived'],archived:[],cancelled:[]};const rawAllowed=[d.status,...(kind==='incoming'?incomingTransitions[d.status]||[]:outgoingTransitions[d.status]||[])];const allowed=rawAllowed.filter((s:string)=>s===d.status||(s!=='approved'&&s!=='sent')||hasPermission(permissions,'documents.approve'));const statusLabels:any={received:'รับเรื่อง',registered:'ลงทะเบียนแล้ว',assigned:'มอบหมายแล้ว',in_progress:'กำลังดำเนินการ',completed:'เสร็จสิ้น',archived:'จัดเก็บ',cancelled:'ยกเลิก',draft:'ร่าง',pending_approval:'รออนุมัติ',approved:'อนุมัติแล้ว',sent:'ส่งแล้ว'};const statusOptionsHtml=allowed.map((s:string)=>'<option value="'+s+'">'+statusLabels[s]+'</option>').join('')
 const handlingLabel=kind==='incoming'?(d.handling_type==='for_information'?'แจ้งเพื่อทราบ · ไม่ต้องมอบหมาย':'มอบหมายให้ผู้ปฏิบัติ'):'-';
 const taskHtml=(assignments||[]).map((a:any)=>'<div class="row"><span>'+esc(peopleMap.get(a.assigned_to)||a.assigned_to)+'</span><span>'+esc(a.due_date||'-')+'</span><span><select data-task-status="'+esc(a.id)+'"><option value="pending">รอดำเนินการ</option><option value="accepted">รับงานแล้ว</option><option value="in_progress">กำลังดำเนินการ</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิก</option></select></span><button class="secondary small" data-task-save="'+esc(a.id)+'">บันทึก</button></div>').join('')||'<p class="muted">ยังไม่มีการมอบหมาย</p>'
 const activePeople=(people||[]).filter((p:any)=>p.is_active!==false&&(!currentProfile?.department_id||!p.department_id||p.department_id===currentProfile.department_id));const options=activePeople.map((p:any)=>'<option value="'+esc(p.id)+'">'+esc(p.full_name||p.id)+(p.position?' · '+esc(p.position):'')+'</option>').join('')
 app.innerHTML='<div class="modal-backdrop"><section class="modal panel"><button id="close-detail" class="secondary">ปิด</button>'+(hasPermission(permissions,'documents.delete')?'<button id="delete-document" class="secondary">ลบเอกสารถาวร</button>':'')+'<h1>'+esc(d.document_no)+'</h1><p><strong>เรื่อง:</strong> '+esc(d.subject)+'</p><div class="detail-grid">'+(kind==='incoming'?'<div><strong>การดำเนินการ:</strong> '+esc(handlingLabel)+'</div>':'')+'<div><strong>วันที่:</strong> '+esc(kind==='incoming'?d.received_date:d.document_date)+'</div><div><strong>สถานะ:</strong> '+esc(d.status)+'</div>'+(kind==='incoming'?'<div><strong>เลขที่หนังสือจากหน่วยงานผู้ส่ง:</strong> '+esc(d.sender_document_no||'-')+'</div>':'')+'<div><strong>'+(kind==='incoming'?'ผู้ส่ง':'ผู้รับ')+':</strong> '+esc(kind==='incoming'?d.sender:d.recipient)+'</div><div><strong>ความเร่งด่วน:</strong> '+esc(d.priority)+'</div></div><p>'+esc(d.description||'')+'</p>'+'<div class="panel"><h2>สถานะเอกสาร</h2><div class="actions"><select id="doc-status">'+statusOptionsHtml+'</select><button id="save-doc-status" '+(allowed.length<=1?'disabled':'')+'>บันทึก</button></div><p class="muted">'+(allowed.length>1?'สามารถเปลี่ยนได้เฉพาะสถานะตามขั้นตอนของเอกสาร':'สถานะนี้เป็นสถานะสุดท้าย')+'</p></div>'+''+workflowHtml+'<div class="panel"><h2>ไฟล์แนบ</h2>'+fileHtml+'<div class="actions"><input id="detail-file" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"><button id="detail-upload" class="secondary">อัปโหลดไฟล์แนบ</button></div></div><div class="panel"><h2>งานที่มอบหมาย</h2>'+(kind==='incoming'&&d.handling_type==='for_information'?'<p class="muted">หนังสือนี้เป็น “แจ้งเพื่อทราบ” จึงไม่ต้องมอบหมายผู้ปฏิบัติ</p>':taskHtml+(hasPermission(permissions,'documents.assign')?'<hr><form id="assign-form" class="form-grid"><label class="full">ผู้รับผิดชอบ (เลือกได้หลายคนในครั้งเดียว)<select name="assigned_to" multiple size="6" required><option value="">เลือกผู้รับผิดชอบ</option>'+options+'</select><small class="muted">เลือกได้มากกว่า 1 คน แล้วกด “มอบหมายงาน” เพียงครั้งเดียว ระบบจะสร้างงานให้ทุกคนที่เลือก</small></label><label>กำหนดส่ง<input name="due_date" type="date"></label><label class="full">หมายเหตุ<textarea name="note" rows="2"></textarea></label><div class="full"><button>มอบหมายงาน</button></div></form>':'<p class="muted">คุณไม่มีสิทธิ์มอบหมายงาน</p>'))+'</div></section></div>>'
 ;(document.querySelector<HTMLSelectElement>('#doc-status')!).value=d.status
 document.querySelector('#close-detail')!.addEventListener('click',()=>renderDashboard(userId,kind));document.querySelector('#delete-document')?.addEventListener('click',async()=>{if(!confirm('ยืนยันลบ '+d.document_no+' แบบถาวร? การลบจะลบไฟล์จาก Google Drive และข้อมูลหนังสือจากฐานข้อมูล และไม่สามารถกู้คืนผ่านระบบได้'))return;const button=document.querySelector<HTMLButtonElement>('#delete-document')!;setBusy(button,true,'กำลังลบ...');const ok=await deleteDocument(kind,id);setBusy(button,false);if(ok){alert('ลบเอกสารและไฟล์แนบเรียบร้อย');await renderDashboard(userId,kind)}})
 document.querySelector('#save-doc-status')!.addEventListener('click',async()=>{const button=document.querySelector<HTMLButtonElement>('#save-doc-status')!;const status=(document.querySelector<HTMLSelectElement>('#doc-status')!).value;setBusy(button,true,'กำลังบันทึก...');const {error}=await supabase.from(table).update({status}).eq('id',id);setBusy(button,false);if(error)alert('เปลี่ยนสถานะไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)});document.querySelector('#detail-upload')!.addEventListener('click',async()=>{const button=document.querySelector<HTMLButtonElement>('#detail-upload')!;const input=document.querySelector<HTMLInputElement>('#detail-file')!;const files=Array.from(input.files||[]);if(!files.length){alert('กรุณาเลือกไฟล์');return}setBusy(button,true,'กำลังอัปโหลด...');const ok=await uploadDocumentFiles(kind,id,files);setBusy(button,false);if(ok)await showDocument(kind,id,userId)});
 const assignForm=document.querySelector<HTMLFormElement>('#assign-form');if(assignForm)assignForm.onsubmit=async e=>{e.preventDefault();const submit=assignForm.querySelector<HTMLButtonElement>('button');if(submit)setBusy(submit,true,'กำลังมอบหมาย...');const fd=new FormData(e.currentTarget);const assignedTo=[...new Set(fd.getAll('assigned_to').map(v=>String(v)).filter(Boolean))];if(!assignedTo.length){if(submit)setBusy(submit,false);alert('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน');return}const payload=assignedTo.map(assigned_to=>({assigned_to,assigned_by:userId,due_date:fd.get('due_date')||null,note:fd.get('note')||null,status:'pending',[fk]:id}));const {error}=await supabase.from('assignments').insert(payload);if(submit)setBusy(submit,false);if(error)alert('มอบหมายไม่สำเร็จ: '+error.message);else{alert('มอบหมายงานให้ '+assignedTo.length+' คนเรียบร้อย');await showDocument(kind,id,userId)}}
 document.querySelectorAll<HTMLButtonElement>('[data-task-save]').forEach(b=>b.onclick=async()=>{const taskId=b.dataset.taskSave!;const select=document.querySelector<HTMLSelectElement>('[data-task-status="'+taskId+'"]')!;setBusy(b,true,'กำลังบันทึก...');const {error}=await supabase.from('assignments').update({status:select.value}).eq('id',taskId);setBusy(b,false);if(error)alert('อัปเดตงานไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)});document.querySelectorAll<HTMLSelectElement>('[data-task-status]').forEach(sel=>{sel.value=(assignments||[]).find((a:any)=>a.id===sel.dataset.taskStatus)?.status||'pending'})
}

async function deleteDocument(kind:'incoming'|'outgoing',id:string){
  const {data:{session}}=await supabase.auth.getSession()
  if(!session){alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');return false}
  const response=await fetch(deleteFunctionUrl,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'','Content-Type':'application/json'},body:JSON.stringify({document_type:kind,document_id:id})})
  const result=await response.json().catch(()=>({}))
  if(!response.ok||!result.ok){alert(result.error||result.message||'ลบเอกสารไม่สำเร็จ');return false}
  return true
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
 const permissions=await getUserPermissions(userId);if(!hasPermission(permissions,'users.manage')){alert('คุณไม่มีสิทธิ์จัดการผู้ใช้งาน');await renderDashboard(userId);return}
 const {data,error}=await invokeAdminUsers({action:'list'})
 if(error||!data){alert('โหลดผู้ใช้งานไม่สำเร็จ: '+await functionErrorMessage(error));return}
 const users=(data.users||[]) as any[]
 const roleLabel=(code:string)=>({admin:'ผู้ดูแลระบบ',director:'ผู้อำนวยการ',deputy_director:'รองผู้อำนวยการโรงเรียน',officer:'เจ้าหน้าที่สารบรรณ',staff:'ผู้ใช้งาน'})[code]||code
 const rows=users.map(u=>{
   const role=u.roles?.[0]?.code||'staff'
   const leavePolicy=u.leave_policy||'other'
   const position=u.position||''
   const leavePolicyLabel=({teacher_civil_servant:'ครู/บุคลากรทางการศึกษา',government_employee:'พนักงานราชการ/ลูกจ้างภาครัฐ',other:'อื่น ๆ'} as any)[leavePolicy]||'อื่น ๆ'
   return '<tr><td>'+esc(u.full_name||'-')+'</td><td>'+esc(u.email||'-')+'</td><td>'+esc(roleLabel(role))+'</td><td>'+esc(position||'-')+'</td><td>'+esc(leavePolicyLabel)+'</td><td>'+ (u.confirmed?'ยืนยันแล้ว':'รอยืนยัน') +'</td><td><button class="secondary small" data-edit-user="'+esc(u.id)+'">แก้ไข</button> <button class="secondary small" data-leave-policy-user="'+esc(u.id)+'">สิทธิการลา</button> <button class="secondary small" data-reset-password-user="'+esc(u.id)+'">ตั้งรหัสผ่านใหม่</button> <button class="secondary small" data-delete-user="'+esc(u.id)+'">ลบ</button></td></tr>'
 }).join('')||'<tr><td colspan="7" class="muted">ยังไม่มีผู้ใช้งาน</td></tr>'
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-user-nav="dashboard">ภาพรวม</button><button data-user-nav="incoming">หนังสือรับ</button><button data-user-nav="outgoing">หนังสือส่ง</button><button data-user-nav="tasks">งานของฉัน</button><hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button><button class="active" data-user-nav="users">ผู้ใช้งาน</button></aside><main class="page"><section class="welcome"><h1>จัดการผู้ใช้งาน</h1><p class="muted">เพิ่ม แก้ไขบทบาท สิทธิการลา และลบบัญชีผู้ใช้งาน</p></section><section class="panel"><div class="actions"><button id="import-users" class="secondary">นำเข้าผู้ใช้งานจาก Excel</button></div></section><section class="panel"><form id="invite-user-form" class="form-grid"><label>ชื่อผู้ใช้งาน<input name="full_name" required></label><label>อีเมล<input name="email" type="email" required></label><label>บทบาทผู้ใช้งาน<select name="role_code" required><option value="deputy_director">รองผู้อำนวยการ</option><option value="staff">ผู้ใช้งาน</option><option value="officer">เจ้าหน้าที่สารบรรณ</option><option value="director">ผู้อำนวยการ</option><option value="admin">ผู้ดูแลระบบ</option></select><small class="muted">เลือก “รองผู้อำนวยการโรงเรียน” ในช่องนี้ ไม่ใช่ช่องตำแหน่ง/หน้าที่ด้านล่าง</small></label><label>ตำแหน่ง/หน้าที่<input name="position" placeholder="เช่น รองผู้อำนวยการโรงเรียน, ครู, เจ้าหน้าที่ธุรการ"></label><div class="actions"><button>ส่งคำเชิญ</button></div></form><p id="users-message"></p></section><section class="panel"><div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>ตำแหน่ง</th><th>สิทธิการลา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>'+rows+'</tbody></table></div></section></main></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelectorAll<HTMLButtonElement>('[data-user-nav]').forEach(b=>b.onclick=()=>renderDashboard(userId,b.dataset.userNav as View))
 document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId))
 document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId))
 document.querySelector('#import-users')!.addEventListener('click',()=>renderUserImport(userId,()=>renderUsers(userId)))
 document.querySelector<HTMLFormElement>('#invite-user-form')!.onsubmit=async e=>{
   e.preventDefault()
   const fd=new FormData(e.currentTarget)
   const m=document.querySelector('#users-message')!
   const {error}=await invokeAdminUsers({action:'invite',full_name:fd.get('full_name'),email:fd.get('email'),role_code:fd.get('role_code'),position:fd.get('position')})
   if(error){m.textContent='ส่งคำเชิญไม่สำเร็จ: '+await functionErrorMessage(error);m.className='error';return}
   m.textContent='ส่งคำเชิญเรียบร้อย ผู้ใช้งานจะได้รับอีเมลเพื่อเข้าระบบ';m.className='success'
   e.currentTarget.reset()
   setTimeout(()=>renderUsers(userId),800)
 }
 document.querySelectorAll<HTMLButtonElement>('[data-edit-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.editUser);if(!u)return
   const fullName=prompt('ชื่อผู้ใช้งาน',u.full_name||'');if(fullName===null)return
   const current=u.roles?.[0]?.code||'staff'
   const roleCode=prompt('บทบาท: admin / director / deputy_director / officer / staff',current);if(roleCode===null)return
   const position=prompt('ตำแหน่ง/หน้าที่',u.position||'');if(position===null)return
   const {error}=await invokeAdminUsers({action:'update',user_id:u.id,full_name:fullName,role_code:roleCode,position:position.trim()})
   if(error)alert('แก้ไขไม่สำเร็จ: '+await functionErrorMessage(error));else await renderUsers(userId)
 })
 document.querySelectorAll<HTMLButtonElement>('[data-leave-policy-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.leavePolicyUser);if(!u)return
   const current=u.leave_policy||'other'
   const policy=prompt('สิทธิการลา: teacher_civil_servant / government_employee / other',current)
   if(policy===null)return
   const normalized=policy.trim()
   if(!['teacher_civil_servant','government_employee','other'].includes(normalized)){alert('ค่าที่เลือกไม่ถูกต้อง');return}
   const {error}=await supabase.from('profiles').update({leave_policy:normalized}).eq('id',u.id)
   if(error)alert('เปลี่ยนสิทธิการลาไม่สำเร็จ: '+error.message);else await renderUsers(userId)
 })
 document.querySelectorAll<HTMLButtonElement>('[data-reset-password-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.resetPasswordUser);if(!u)return
   const label=u.full_name||u.email||'ผู้ใช้งาน'
   if(!confirm('ยืนยันว่าต้องการให้ผู้ดูแลระบบตั้งรหัสผ่านใหม่ให้ '+label+' ?'))return
   const password=prompt('กรอกรหัสผ่านใหม่สำหรับ '+label+' (อย่างน้อย 6 ตัวอักษร)')
   if(password===null)return
   if(password.length<6){alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');return}
   const confirmPassword=prompt('กรอกรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน')
   if(confirmPassword===null)return
   if(password!==confirmPassword){alert('รหัสผ่านทั้งสองครั้งไม่ตรงกัน');return}
   const {error}=await invokeAdminUsers({action:'reset_password',user_id:u.id,password})
   if(error)alert('ตั้งรหัสผ่านใหม่ไม่สำเร็จ: '+await functionErrorMessage(error))
   else{alert('ตั้งรหัสผ่านใหม่ให้ '+label+' เรียบร้อยแล้ว\nกรุณาแจ้งรหัสผ่านใหม่แก่ผู้ใช้งานผ่านช่องทางที่ปลอดภัย');await renderUsers(userId)}
 })
 document.querySelectorAll<HTMLButtonElement>('[data-delete-user]').forEach(b=>b.onclick=async()=>{
   const u=users.find(x=>x.id===b.dataset.deleteUser);if(!u)return
   if(!confirm('ยืนยันการลบบัญชี '+(u.full_name||u.email)+' ?'))return
   const {error}=await invokeAdminUsers({action:'delete',user_id:u.id})
   if(error)alert('ลบผู้ใช้งานไม่สำเร็จ: '+await functionErrorMessage(error));else await renderUsers(userId)
 })
}

async function renderDocumentList(kind:'incoming'|'outgoing',userId:string,filters:{search?:string,status?:string,from?:string,to?:string,cursorDate?:string,cursorId?:string}={}){renderLoading('กำลังโหลด'+(kind==='incoming'?'หนังสือรับ':'หนังสือส่ง')+'...');const table=kind==='incoming'?'incoming_documents':'outgoing_documents';const dateField=kind==='incoming'?'received_date':'document_date';const title=kind==='incoming'?'หนังสือรับ':'หนังสือส่ง';const canCreate=hasPermission(await getUserPermissions(userId),'documents.create');const search=filters.search||'',status=filters.status||'',from=filters.from||'',to=filters.to||'',cursorDate=filters.cursorDate||'',cursorId=filters.cursorId||'';let query=supabase.from(table).select(kind==='incoming'?'id,document_no,'+dateField+',subject,status,sender_document_no':'id,document_no,'+dateField+',subject,status').order(dateField,{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);if(search.trim()){const q=search.trim().replace(/[%_]/g,'');query=kind==='incoming'?query.or('document_no.ilike.%'+q+'%,sender_document_no.ilike.%'+q+'%,subject.ilike.%'+q+'%'):query.or('document_no.ilike.%'+q+'%,subject.ilike.%'+q+'%')}if(status)query=query.eq('status',status);if(from)query=query.gte(dateField,from);if(to)query=query.lte(dateField,to);if(cursorDate&&cursorId)query=query.or(dateField+'.lt.'+cursorDate+',and('+dateField+'.eq.'+cursorDate+',id.lt.'+cursorId+')');const {data,error}=await query;if(error){renderLoadError('โหลด'+title+'ไม่สำเร็จ: '+error.message,()=>renderDocumentList(kind,userId,filters));return}const opts=kind==='incoming'?[['','ทุกสถานะ'],['received','รับเรื่อง'],['registered','ลงทะเบียนแล้ว'],['assigned','มอบหมายแล้ว'],['in_progress','กำลังดำเนินการ'],['completed','เสร็จสิ้น'],['archived','จัดเก็บ'],['cancelled','ยกเลิก']]:[['','ทุกสถานะ'],['draft','ร่าง'],['pending_approval','รออนุมัติ'],['approved','อนุมัติแล้ว'],['sent','ส่งแล้ว'],['archived','จัดเก็บ'],['cancelled','ยกเลิก']];const statusHtml=opts.map(([v,l])=>'<option value="'+v+'" '+(status===v?'selected':'')+'>'+l+'</option>').join('');const hasMore=(data||[]).length===PAGE_SIZE;const next=data?.length?data[data.length-1]:null;app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-list-nav="dashboard">ภาพรวม</button><button class="active" data-list-nav="'+kind+'">'+title+'</button><button data-list-nav="'+(kind==='incoming'?'outgoing':'incoming')+'">'+(kind==='incoming'?'หนังสือส่ง':'หนังสือรับ')+'</button><button data-list-nav="tasks">งานของฉัน</button><hr>'+(canCreate?'<button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button>':'')+'</aside><main class="page"><section class="welcome"><h1>'+title+'</h1><div class="toolbar"><input id="document-search" placeholder="ค้นหาเลขทะเบียนหรือชื่อเรื่อง" value="'+esc(search)+'"><select id="document-status">'+statusHtml+'</select><label>ตั้งแต่<input id="document-from" type="date" value="'+esc(from)+'"></label><label>ถึง<input id="document-to" type="date" value="'+esc(to)+'"></label><button id="search-document">ค้นหา</button><button id="clear-document-filter" class="secondary">ล้าง</button>'+(canCreate?'<button id="new-document">＋ ลงทะเบียน'+title+'</button>':'')+'</div></section><section class="panel"><p class="muted">แสดง '+(data?.length||0)+' รายการ'+(hasMore?' · มีรายการถัดไป':'')+'</p><div class="table-head"><b>เลขทะเบียน</b><b>วันที่</b>'+ (kind==='incoming'?'<b>เลขที่หนังสือจากหน่วยงาน</b>':'') +'<b>เรื่อง</b><b>สถานะ</b></div>'+listRows(data||[],dateField,kind)+(hasMore?'<div class="actions"><button id="next-page" class="secondary">โหลดรายการถัดไป</button></div>':'')+'</section></main></div></div>';document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelectorAll<HTMLButtonElement>('[data-list-nav]').forEach(b=>b.onclick=()=>{const v=b.dataset.listNav as View;if(v==='incoming'||v==='outgoing')renderDocumentList(v,userId);else renderDashboard(userId,v)});document.querySelector('#new-in')?.addEventListener('click',()=>documentForm('incoming',userId));document.querySelector('#new-out')?.addEventListener('click',()=>documentForm('outgoing',userId));document.querySelector('#new-document')?.addEventListener('click',()=>documentForm(kind,userId));const doSearch=()=>renderDocumentList(kind,userId,{search:(document.querySelector<HTMLInputElement>('#document-search')!).value,status:(document.querySelector<HTMLSelectElement>('#document-status')!).value,from:(document.querySelector<HTMLInputElement>('#document-from')!).value,to:(document.querySelector<HTMLInputElement>('#document-to')!).value});document.querySelector('#search-document')!.addEventListener('click',doSearch);document.querySelector('#clear-document-filter')!.addEventListener('click',()=>renderDocumentList(kind,userId));document.querySelector<HTMLInputElement>('#document-search')!.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch()}});if(hasMore)document.querySelector('#next-page')!.addEventListener('click',()=>renderDocumentList(kind,userId,{...filters,search,status,from,to,cursorDate:next[dateField],cursorId:next.id}));document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.docKind as 'incoming'|'outgoing',el.dataset.docId!,userId)))}

async function getLeaveLegalPreview(userId:string,leaveType:string,start:string,end:string){
 const daysResult=await supabase.rpc('count_leave_working_days',{p_start:start,p_end:end});
 const noticeResult=await supabase.rpc('leave_policy_notice',{p_user:userId,p_type:leaveType,p_start:start,p_end:end});
 const fiscalResult=await supabase.rpc('fiscal_year_for',{p_date:start});
 const fy=fiscalResult.data as number;
 let used=0;
 if(leaveType==='personal'||leaveType==='sick'){
   const usedResult=await supabase.rpc('leave_used_working_days_between',{p_user:userId,p_type:leaveType,p_start:start,p_end:end});
   used=Number(usedResult.data||0);
 }
 return {days:Number(daysResult.data||0),used,notice:String(noticeResult.data||''),fiscalYear:fy};
}
async function refreshLeaveLegalPreview(userId:string){
 const form=document.querySelector<HTMLFormElement>('#leave-form');if(!form)return;
 const type=form.querySelector<HTMLSelectElement>('[name="leaveType"]')!.value;
 const start=form.querySelector<HTMLInputElement>('[name="startDate"]')!.value;
 const end=form.querySelector<HTMLInputElement>('[name="endDate"]')!.value;
 const daysEl=document.querySelector('#leave-days-preview')!;
 const noticeEl=document.querySelector('#leave-legal-preview')!;
 const ack=document.querySelector<HTMLInputElement>('#leave-legal-ack');
 if(!start||!end||end<start){daysEl.textContent='';noticeEl.textContent='';if(ack)ack.closest('label')!.style.display='none';return} const p=await getLeaveLegalPreview(userId,type,start,end);
 daysEl.textContent=type==='official'||type==='outside_school'?'ไม่หักวันลา':('วันลาที่นับตามราชการ: '+p.days+' วันทำการ · ใช้ไปแล้วในช่วงปีงบประมาณที่เกี่ยวข้อง: '+p.used+' วัน · เริ่มปีงบประมาณ '+(p.fiscalYear+543));
 noticeEl.textContent=p.notice;
 noticeEl.className=(p.notice.includes('เกิน')?'error':'muted');
 if(ack){ack.closest('label')!.style.display=p.notice.includes('เกิน')?'block':'none';ack.checked=false}
}
async function saveLeaveRequest(userId:string){
 const fd=new FormData(document.querySelector<HTMLFormElement>('#leave-form')!);
 const leaveType=String(fd.get('leaveType')||'');
 const start=String(fd.get('startDate')||'');
 const end=String(fd.get('endDate')||'');
 const preview=await getLeaveLegalPreview(userId,leaveType,start,end);
 const ack=document.querySelector<HTMLInputElement>('#leave-legal-ack');
 if(preview.notice.includes('เกิน')&&!ack?.checked){alert('กรุณาอ่านและทำเครื่องหมายรับทราบข้อความด้านกฎหมายก่อนส่งคำขอ');return}
 const payload={requested_by:userId,leave_type:leaveType,start_date:start,end_date:end,start_time:fd.get('startTime')||null,end_time:fd.get('endTime')||null,reason:fd.get('reason'),destination:fd.get('destination')||null,contact_phone:fd.get('contactPhone')||null};
 const m=document.querySelector('#leave-message')!;
 const {error}=await supabase.from('leave_requests').insert(payload);
 if(error){m.textContent='ยื่นคำขอไม่สำเร็จ: '+error.message;m.className='error';return}
 m.textContent='ยื่นคำขอเรียบร้อยแล้ว · นับวันลา '+preview.days+' วันทำการ';m.className='success';
 setTimeout(()=>renderLeaveList(userId),900);
}
async function renderLeaveForm(userId:string){
 const p=await loadProfile(userId);
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button id="back-leave">← ระบบการลา</button></aside><main class="page"><section class="welcome"><h1>ยื่นคำขอลา</h1><p class="muted">ผู้ยื่นคำขอ: '+esc(p?.full_name||'')+'</p><p class="muted">ระบบจะนับวันลาตามวันทำการและปีงบประมาณ โดยใช้ปฏิทินวันหยุดที่ตั้งค่าไว้</p></section><section class="panel form-panel"><form id="leave-form" class="form-grid"><label>ประเภทการลา<select name="leaveType" required><option value="personal">ลากิจ</option><option value="sick">ลาป่วย</option><option value="official">ขออนุญาตไปราชการ</option><option value="outside_school">ขออนุญาตออกนอกโรงเรียน</option></select></label><label>วันที่เริ่ม<input name="startDate" type="date" value="'+today()+'" required></label><label>วันที่สิ้นสุด<input name="endDate" type="date" value="'+today()+'" required></label><label>เวลาเริ่มต้น (ถ้ามี)<input name="startTime" type="time"></label><label>เวลาสิ้นสุด (ถ้ามี)<input name="endTime" type="time"></label><label class="full">เหตุผล/รายละเอียด<textarea name="reason" rows="4" required placeholder="ระบุเหตุผลหรือรายละเอียด"></textarea></label><label>สถานที่/ปลายทาง (ถ้ามี)<input name="destination"></label><label>เบอร์ติดต่อระหว่างลา (ถ้ามี)<input name="contactPhone" type="tel"></label><div class="full panel" style="margin:0"><strong id="leave-days-preview"></strong><p id="leave-legal-preview" class="muted"></p><label id="leave-ack-wrap" style="display:none"><input id="leave-legal-ack" type="checkbox"> รับทราบว่าคำขอนี้เกินเกณฑ์ปกติและต้องให้ผู้มีอำนาจพิจารณาตามกฎหมาย/ระเบียบที่เกี่ยวข้อง</label></div><div class="full actions"><button>ส่งคำขอลา</button><button type="button" id="cancel-leave-form" class="secondary">ยกเลิก</button></div><p id="leave-message" class="full"></p></form></section></main></div></div>';
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());
 document.querySelector('#back-leave')!.addEventListener('click',()=>renderLeaveList(userId));
 document.querySelector('#cancel-leave-form')!.addEventListener('click',()=>renderLeaveList(userId));
 const refresh=()=>refreshLeaveLegalPreview(userId);
 document.querySelector<HTMLSelectElement>('[name="leaveType"]')!.addEventListener('change',refresh);
 document.querySelector<HTMLInputElement>('[name="startDate"]')!.addEventListener('change',refresh);
 document.querySelector<HTMLInputElement>('[name="endDate"]')!.addEventListener('change',refresh);
 await refresh();
 document.querySelector<HTMLFormElement>('#leave-form')!.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget as HTMLFormElement;const start=f.querySelector<HTMLInputElement>('[name="startDate"]')!.value;const end=f.querySelector<HTMLInputElement>('[name="endDate"]')!.value;const st=f.querySelector<HTMLInputElement>('[name="startTime"]')!.value;const et=f.querySelector<HTMLInputElement>('[name="endTime"]')!.value;if(end<start){alert('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');return}if(start===end&&st&&et&&et<=st){alert('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');return}await saveLeaveRequest(userId)};
}
async function renderHolidayManager(userId:string){
 const permissions=await getUserPermissions(userId);if(!hasPermission(permissions,'leave.approve')){alert('คุณไม่มีสิทธิ์จัดการปฏิทินวันหยุด');return}
 const year=new Date().getFullYear();
 const {data,error}=await supabase.from('government_holidays').select('id,holiday_date,name,scope,region,is_working_day').gte('holiday_date',year+'-01-01').lte('holiday_date',year+'-12-31').order('holiday_date');
 if(error){alert('โหลดปฏิทินวันหยุดไม่สำเร็จ: '+error.message);return}
 const rows=(data||[]).map((h:any)=>'<tr><td>'+esc(h.holiday_date)+'</td><td>'+esc(h.name)+'</td><td>'+esc(h.scope)+(h.region?' / '+esc(h.region):'')+'</td><td>'+(h.is_working_day?'วันทำการพิเศษ':'วันหยุด')+'</td><td><button class="secondary small" data-edit-holiday="'+esc(h.id)+'">แก้ไข</button> <button class="secondary small" data-delete-holiday="'+esc(h.id)+'">ลบ</button></td></tr>').join('')||'<tr><td colspan="5" class="muted">ยังไม่มีวันหยุดในปี '+year+'</td></tr>';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button id="back-leave">← ระบบการลา</button></aside><main class="page"><section class="welcome"><h1>จัดการปฏิทินวันหยุด</h1><p class="muted">ปี ค.ศ. '+year+' · ใช้สำหรับคำนวณวันทำการของระบบการลา</p></section><section class="panel"><form id="holiday-form" class="form-grid"><label>วันที่<input name="holiday_date" type="date" required></label><label>ชื่อวันหยุด<input name="name" required></label><label>ขอบเขต<select name="scope"><option value="national">ระดับประเทศ</option><option value="regional">ระดับภูมิภาค</option><option value="school">โรงเรียน</option></select></label><label>จังหวัด/พื้นที่ (ถ้ามี)<input name="region"></label><label><input name="is_working_day" type="checkbox"> เป็นวันทำการพิเศษ</label><div class="actions"><button>เพิ่มวันหยุด</button></div></form><p class="muted">วันหยุดพิเศษเฉพาะพื้นที่ต้องกำหนดขอบเขตให้ถูกต้อง ไม่ควรนำวันหยุดของกรุงเทพมหานครมาใช้กับจังหวัดนครสวรรค์โดยอัตโนมัติ</p></section><section class="panel"><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวัน</th><th>ขอบเขต</th><th>ประเภท</th><th>จัดการ</th></tr></thead><tbody>'+rows+'</tbody></table></div></section></main></div></div>';
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelector('#back-leave')!.addEventListener('click',()=>renderLeaveList(userId));
 document.querySelector<HTMLFormElement>('#holiday-form')!.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.from('government_holidays').insert({holiday_date:fd.get('holiday_date'),name:fd.get('name'),scope:fd.get('scope'),region:fd.get('region')||null,is_working_day:fd.get('is_working_day')==='on'});if(error)alert('เพิ่มวันหยุดไม่สำเร็จ: '+error.message);else await renderHolidayManager(userId)}
 document.querySelectorAll<HTMLButtonElement>('[data-edit-holiday]').forEach(b=>b.onclick=async()=>{const h=(data||[]).find((x:any)=>x.id===b.dataset.editHoliday);if(!h)return;const name=prompt('ชื่อวันหยุด',h.name);if(name===null)return;const date=prompt('วันที่ YYYY-MM-DD',h.holiday_date);if(date===null)return;const working=confirm('ให้ถือเป็นวันทำการพิเศษหรือไม่?');const {error}=await supabase.from('government_holidays').update({name:name.trim(),holiday_date:date.trim(),is_working_day:working}).eq('id',h.id);if(error)alert('แก้ไขไม่สำเร็จ: '+error.message);else await renderHolidayManager(userId)})
 document.querySelectorAll<HTMLButtonElement>('[data-delete-holiday]').forEach(b=>b.onclick=async()=>{if(!confirm('ยืนยันลบรายการวันหยุดนี้?'))return;const {error}=await supabase.from('government_holidays').delete().eq('id',b.dataset.deleteHoliday!);if(error)alert('ลบไม่สำเร็จ: '+error.message);else await renderHolidayManager(userId)})
}
async function updateLeaveStatus(userId:string,id:string,status:'approved'|'rejected'){
 const reason=status==='rejected'?prompt('ระบุเหตุผลที่ไม่อนุมัติ (จำเป็น)')||'':'';
 if(status==='rejected'&&!reason.trim()){alert('กรุณาระบุเหตุผลที่ไม่อนุมัติ');return}
 const {error}=await supabase.from('leave_requests').update({status,approver_id:userId,approved_at:status==='approved'?new Date().toISOString():null,rejection_reason:status==='rejected'?reason:null}).eq('id',id);
 if(error){alert('ดำเนินการไม่สำเร็จ: '+error.message);return}
 await renderLeaveList(userId);
}
async function cancelLeaveRequest(userId:string,id:string){
 const {data:leave,error:loadError}=await supabase.from('leave_requests').select('id,request_no,start_date,status').eq('id',id).eq('requested_by',userId).maybeSingle();
 if(loadError||!leave){alert('ไม่พบคำขอลาที่สามารถยกเลิกได้');return}
 if(!['pending','approved'].includes(leave.status)){alert('รายการนี้ไม่อยู่ในสถานะที่ยกเลิกได้');return}
 if(leave.start_date<=today()){alert('สามารถยกเลิกได้เฉพาะก่อนวันเริ่มลาเท่านั้น');return}
 const message=leave.status==='approved'
   ? 'คำขอนี้อนุมัติแล้ว หากยกเลิกก่อนวันเริ่มลา จำนวนวันลาจะถูกคืนกลับไปคำนวณสิทธิ์โดยอัตโนมัติ\\n\\nยืนยันการยกเลิก '+leave.request_no+' ?'
   : 'ยืนยันการยกเลิกคำขอ '+leave.request_no+' ?';
 if(!confirm(message))return;
 const {error}=await supabase.from('leave_requests').update({status:'cancelled'}).eq('id',id).eq('requested_by',userId).in('status',['pending','approved']);
 if(error){alert('ยกเลิกไม่สำเร็จ: '+error.message);return}
 alert('ยกเลิกการลาเรียบร้อยแล้ว\\nระบบคืนวันลาในการคำนวณสิทธิ์ และบันทึกประวัติการยกเลิกไว้แล้ว');
 await renderLeaveList(userId);
}
async function renderLeaveList(userId:string){
 const permissions=await getUserPermissions(userId);
 const canApprove=hasPermission(permissions,'leave.approve');
 renderLoading('กำลังโหลดระบบการลา...');
 let query=supabase.from('leave_requests').select('id,request_no,requested_by,leave_type,start_date,end_date,start_time,end_time,reason,destination,contact_phone,status,approver_id,approved_at,rejection_reason,created_at,counted_days,fiscal_year,legal_notice').order('created_at',{ascending:false}).limit(100);
 if(!canApprove)query=query.eq('requested_by',userId);
 const {data,error}=await query;
 if(error){renderLoadError('โหลดข้อมูลการลาไม่สำเร็จ: '+error.message,()=>renderLeaveList(userId));return}
 const ids=[...new Set((data||[]).map((x:any)=>x.requested_by).filter(Boolean))];
 const {data:people}=ids.length?await supabase.from('profiles').select('id,full_name,position').in('id',ids):{data:[] as any[]};
 const map=new Map((people||[]).map((p:any)=>[p.id,p]));
 const typeLabels:any={personal:'ลากิจ',sick:'ลาป่วย',official:'ไปราชการ',outside_school:'ออกนอกโรงเรียน'};
 const statusLabels:any={pending:'รออนุมัติ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',cancelled:'ยกเลิก'};
 const rows=(data||[]).map((x:any)=>'<div class="table-row leave-row"><span>'+esc(x.request_no)+'</span><span>'+esc(typeLabels[x.leave_type])+'</span><span>'+esc(x.start_date+(x.end_date!==x.start_date?' ถึง '+x.end_date:''))+'</span><span>'+esc((x.counted_days||0)+' วันทำการ')+'</span><span>'+esc(map.get(x.requested_by)?.full_name||x.requested_by)+'</span><span>'+esc(statusLabels[x.status])+'</span><div class="leave-actions">'+(canApprove&&x.status==='pending'?'<button class="small" data-approve-leave="'+esc(x.id)+'">อนุมัติ</button><button class="secondary small" data-reject-leave="'+esc(x.id)+'">ไม่อนุมัติ</button>':'')+(!canApprove&&(x.status==='pending'||x.status==='approved')&&x.start_date>today()?'<button class="secondary small" data-cancel-leave="'+esc(x.id)+'">'+(x.status==='approved'?'ยกเลิกการอนุมัติ/การลา':'ยกเลิกคำขอ')+'</button>':'')+'</div></div>').join('')||'<p class="muted">ยังไม่มีคำขอลา</p>';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-leave-nav="dashboard">ภาพรวม</button><button class="active">ระบบการลา</button><button id="new-leave">＋ ยื่นคำขอลา</button>'+(canApprove?'<button id="manage-holidays">⚙ ปฏิทินวันหยุด</button>':'')+'<hr><button data-leave-nav="incoming">หนังสือรับ</button><button data-leave-nav="outgoing">หนังสือส่ง</button></aside><main class="page"><section class="welcome"><h1>ระบบการลา</h1><p class="muted">จัดการคำขอลาและการขออนุญาตของบุคลากร</p></section><section class="stats"><article><span>รายการทั้งหมด'+(canApprove?'':'ของฉัน')+'</span><strong>'+(data?.length||0)+'</strong></article><article><span>รออนุมัติ</span><strong>'+(data||[]).filter((x:any)=>x.status==='pending').length+'</strong></article><article><span>อนุมัติแล้ว</span><strong>'+(data||[]).filter((x:any)=>x.status==='approved').length+'</strong></article></section><section class="panel"><div class="table-head leave-head"><b>เลขที่</b><b>ประเภท</b><b>ช่วงวันที่</b><b>วันลา</b><b>ผู้ยื่น</b><b>สถานะ</b><b>การดำเนินการ</b></div>'+rows+'</section></main></div></div>';
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());
 document.querySelector('#new-leave')!.addEventListener('click',()=>renderLeaveForm(userId));;if(canApprove)document.querySelector('#manage-holidays')!.addEventListener('click',()=>renderHolidayManager(userId))
 document.querySelectorAll<HTMLButtonElement>('[data-leave-nav]').forEach(b=>b.onclick=()=>{const v=b.dataset.leaveNav as View;if(v==='incoming'||v==='outgoing')renderDocumentList(v,userId);else renderDashboard(userId,v)});
 document.querySelectorAll<HTMLButtonElement>('[data-approve-leave]').forEach(b=>b.onclick=()=>updateLeaveStatus(userId,b.dataset.approveLeave!,'approved'));
 document.querySelectorAll<HTMLButtonElement>('[data-reject-leave]').forEach(b=>b.onclick=()=>updateLeaveStatus(userId,b.dataset.rejectLeave!,'rejected'));
 document.querySelectorAll<HTMLButtonElement>('[data-cancel-leave]').forEach(b=>b.onclick=()=>cancelLeaveRequest(userId,b.dataset.cancelLeave!));
}
async function renderAuditLog(userId:string,filters:{search?:string,action?:string,entityType?:string,cursorDate?:string,cursorId?:string}={}){const permissions=await getUserPermissions(userId);if(!hasPermission(permissions,'users.manage')){alert('คุณไม่มีสิทธิ์ดูประวัติการใช้งาน');await renderDashboard(userId);return}renderLoading('กำลังโหลดประวัติการใช้งาน...');const search=filters.search||'',action=filters.action||'',entityType=filters.entityType||'',cursorDate=filters.cursorDate||'',cursorId=filters.cursorId||'';let query=supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);if(action)query=query.eq('action',action);if(entityType)query=query.eq('entity_type',entityType);if(search.trim()){const q=search.trim().replace(/[%_]/g,'');const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);query=isUuid?query.eq('entity_id',q):query.ilike('entity_type','%'+q+'%')}if(cursorDate&&cursorId)query=query.or('created_at.lt.'+cursorDate+',and(created_at.eq.'+cursorDate+',id.lt.'+cursorId+')');const {data,error}=await query;if(error){renderLoadError('โหลดประวัติการใช้งานไม่สำเร็จ: '+error.message,()=>renderAuditLog(userId,filters));return}const ids=[...new Set((data||[]).map((x:any)=>x.actor_id).filter(Boolean))];const {data:people}=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[] as any[]};const map=new Map((people||[]).map((p:any)=>[p.id,p.full_name]));const al=(a:string)=>({insert:'เพิ่มข้อมูล',update:'แก้ไขข้อมูล',delete:'ลบข้อมูล'})[a]||a;const el=(e:string)=>({incoming_documents:'หนังสือรับ',outgoing_documents:'หนังสือส่ง',assignments:'งานที่มอบหมาย',leave_requests:'คำขอลา',user_roles:'สิทธิ์ผู้ใช้งาน'})[e]||e;const rows=(data||[]).map((x:any)=>'<div class="row"><span>'+esc(new Date(x.created_at).toLocaleString('th-TH'))+'</span><span>'+esc(map.get(x.actor_id)||'ระบบ')+'</span><span>'+esc(al(x.action))+' · '+esc(el(x.entity_type))+'</span><small>'+esc(x.entity_id||'')+'</small></div>').join('')||'<p class="muted">ยังไม่มีประวัติ</p>';const hasMore=(data||[]).length===PAGE_SIZE;const next=data?.length?data[data.length-1]:null;app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-audit-nav="dashboard">ภาพรวม</button><button data-audit-nav="incoming">หนังสือรับ</button><button data-audit-nav="outgoing">หนังสือส่ง</button><button data-audit-nav="tasks">งานของฉัน</button><button class="active">ประวัติการใช้งาน</button><hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button></aside><main class="page"><section class="welcome"><h1>ประวัติการใช้งาน</h1><div class="toolbar"><input id="audit-search" placeholder="ค้นหา entity ID หรือประเภท" value="'+esc(search)+'"><select id="audit-action"><option value="">ทุกการกระทำ</option><option value="insert" '+(action==='insert'?'selected':'')+'>เพิ่มข้อมูล</option><option value="update" '+(action==='update'?'selected':'')+'>แก้ไขข้อมูล</option><option value="delete" '+(action==='delete'?'selected':'')+'>ลบข้อมูล</option></select><select id="audit-entity"><option value="">ทุกประเภท</option><option value="incoming_documents" '+(entityType==='incoming_documents'?'selected':'')+'>หนังสือรับ</option><option value="outgoing_documents" '+(entityType==='outgoing_documents'?'selected':'')+'>หนังสือส่ง</option><option value="assignments" '+(entityType==='assignments'?'selected':'')+'>งานที่มอบหมาย</option><option value="leave_requests" '+(entityType==='leave_requests'?'selected':'')+'>คำขอลา</option><option value="user_roles" '+(entityType==='user_roles'?'selected':'')+'>สิทธิ์ผู้ใช้งาน</option></select><button id="search-audit">ค้นหา</button><button id="clear-audit" class="secondary">ล้าง</button></div></section><section class="panel"><p class="muted">แสดง '+(data?.length||0)+' รายการ'+(hasMore?' · มีรายการถัดไป':'')+'</p>'+rows+(hasMore?'<div class="actions"><button id="next-audit" class="secondary">โหลดรายการถัดไป</button></div>':'')+'</section></main></div></div>';document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelectorAll<HTMLButtonElement>('[data-audit-nav]').forEach(b=>b.onclick=()=>{const v=b.dataset.auditNav as View;if(v==='incoming'||v==='outgoing')renderDocumentList(v,userId);else renderDashboard(userId,v)});document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId));document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId));const doSearch=()=>renderAuditLog(userId,{search:(document.querySelector<HTMLInputElement>('#audit-search')!).value,action:(document.querySelector<HTMLSelectElement>('#audit-action')!).value,entityType:(document.querySelector<HTMLSelectElement>('#audit-entity')!).value});document.querySelector('#search-audit')!.addEventListener('click',doSearch);document.querySelector('#clear-audit')!.addEventListener('click',()=>renderAuditLog(userId));document.querySelector<HTMLInputElement>('#audit-search')!.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch()}});if(hasMore)document.querySelector('#next-audit')!.addEventListener('click',()=>renderAuditLog(userId,{...filters,search,action,entityType,cursorDate:next.created_at,cursorId:next.id}))}
async function renderDashboard(userId:string,view:View='dashboard'){const permissions=await getUserPermissions(userId);if(view==='users'&&!hasPermission(permissions,'users.manage'))view='dashboard';if(view==='audit'&&!hasPermission(permissions,'users.manage'))view='dashboard';if(view==='users'){await renderUsers(userId);return}if(view==='audit'){await renderAuditLog(userId);return}if(view==='leave'){await renderLeaveList(userId);return}if(view==='incoming'||view==='outgoing'){await renderDocumentList(view,userId);return}renderLoading('กำลังโหลดภาพรวม...');const [p,inc,out,tasks,roles,incCount,outCount,pendingApproval,taskCount,pendingLeaveCount]=await Promise.all([loadProfile(userId),supabase.from('incoming_documents').select('id,document_no,received_date,subject,status').order('received_date',{ascending:false}).limit(10),supabase.from('outgoing_documents').select('id,document_no,document_date,subject,status').order('document_date',{ascending:false}).limit(10),supabase.from('assignments').select('id,incoming_document_id,outgoing_document_id,due_date,status,note,incoming_documents(document_no,subject),outgoing_documents(document_no,subject)').eq('assigned_to',userId).neq('status','completed').order('due_date').limit(20),supabase.from('user_roles').select('roles(name)').eq('user_id',userId),supabase.from('incoming_documents').select('id',{count:'exact',head:true}),supabase.from('outgoing_documents').select('id',{count:'exact',head:true}),hasPermission(permissions,'documents.approve')?supabase.from('outgoing_documents').select('id',{count:'exact',head:true}).eq('status','pending_approval'):Promise.resolve({count:0}),supabase.from('assignments').select('id',{count:'exact',head:true}).eq('assigned_to',userId).neq('status','completed'),supabase.from('leave_requests').select('id',{count:'exact',head:true}).eq('requested_by',userId).eq('status','pending')]);const role=(roles.data?.[0] as any)?.roles?.name||'ผู้ใช้งาน';const canManageUsers=hasPermission(permissions,'users.manage');const canCreate=hasPermission(permissions,'documents.create');const canApprove=hasPermission(permissions,'documents.approve');let content='';if(view==='dashboard')content='<section class="welcome"><h1>สวัสดี '+esc(p?.full_name||'ผู้ใช้งาน')+'</h1><p class="muted">บทบาท: '+esc(role)+'</p></section><section class="stats"><article><span>หนังสือรับทั้งหมด</span><strong>'+(incCount.count||0)+'</strong></article><article><span>หนังสือส่งทั้งหมด</span><strong>'+(outCount.count||0)+'</strong></article><article><span>งานค้างของฉัน</span><strong>'+(taskCount.count||0)+'</strong></article><article><span>คำขอลารออนุมัติ</span><strong>'+(pendingLeaveCount.count||0)+'</strong></article>'+(canApprove?'<article><span>รออนุมัติ</span><strong>'+(pendingApproval.count||0)+'</strong></article>':'')+'</section><section class="grid"><article class="panel"><h2>หนังสือรับล่าสุด</h2>'+listRows(inc.data||[],'received_date','incoming')+'</article><article class="panel"><h2>หนังสือส่งล่าสุด</h2>'+listRows(out.data||[],'document_date','outgoing')+'</article></section>';if(view==='tasks')content='<section class="welcome"><h1>งานของฉัน</h1><p class="muted">งานที่ยังไม่เสร็จ · ทั้งหมด '+(taskCount.count||0)+' งาน</p></section><section class="panel">'+((tasks.data||[]).map((d:any)=>{const doc=d.incoming_documents||d.outgoing_documents;const kind=d.incoming_document_id?'incoming':'outgoing';return '<div class="row clickable" data-task-doc="'+esc(d.incoming_document_id||d.outgoing_document_id||'')+'" data-task-kind="'+kind+'"><b>'+esc(d.due_date||'-')+'</b><span>'+esc(doc?.document_no||'')+' — '+esc(doc?.subject||d.note||'งานเอกสาร')+'</span><small>'+esc(d.status)+'</small></div>'}).join('')||'<p class="muted">ไม่มีงานค้าง</p>')+'</section>';app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-view="dashboard">ภาพรวม</button><button data-view="incoming">หนังสือรับ</button><button data-view="outgoing">หนังสือส่ง</button><button data-view="tasks">งานของฉัน</button><button data-view="leave">ระบบการลา</button>'+(canManageUsers?'<button data-view="users">ผู้ใช้งาน</button><button data-view="audit">ประวัติการใช้งาน</button>':'')+'<hr>'+(canCreate?'<button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button>':'')+'</aside><main class="page">'+content+'</main></div></div>';document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>renderDashboard(userId,b.dataset.view as View));document.querySelector('#new-in')?.addEventListener('click',()=>documentForm('incoming',userId));document.querySelector('#new-out')?.addEventListener('click',()=>documentForm('outgoing',userId));document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.docKind as 'incoming'|'outgoing',el.dataset.docId!,userId)));document.querySelectorAll<HTMLElement>('[data-task-doc]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.taskKind as 'incoming'|'outgoing',el.dataset.taskDoc!,userId)))}


async function boot(){
 let invitePending=isInviteSession();
 let recoveryPending=isRecoverySession();
 const handleSession=async(s:any,allowSignedIn:boolean)=>{
   if(!s?.user){renderLogin();return}
   if(recoveryPending||isRecoverySession()){recoveryPending=true;renderPasswordRecovery();return}
   if(invitePending||isInviteSession()||s.user.user_metadata?.must_change_password===true){invitePending=false;renderSetInitialPassword();return}
   if(allowSignedIn) await renderDashboard(s.user.id)
 };
 supabase.auth.onAuthStateChange(async(event,s)=>{
   // IMPORTANT: Do not rebuild the application on token refresh/user updates.
   // Those events can occur while the user is working in a form (including
   // when the browser tab becomes active again). Re-rendering would erase
   // unsaved form data.
   if(event==='PASSWORD_RECOVERY'){
     recoveryPending=true;
     renderPasswordRecovery();
     return;
   }
   if(event==='SIGNED_OUT'){
     invitePending=false;
     recoveryPending=false;
     renderLogin();
     return;
   }
   if(event==='SIGNED_IN'){
     await handleSession(s,true);
     return;
   }
   // INITIAL_SESSION, TOKEN_REFRESHED and USER_UPDATED intentionally do nothing.
 });
 const {data:{session}}=await supabase.auth.getSession();
 if(recoveryPending||isRecoverySession()){
   recoveryPending=true;
   renderPasswordRecovery();
 }else if(session?.user){
   await handleSession(session,false);
 }else{
   renderLogin();
 }
}

boot()