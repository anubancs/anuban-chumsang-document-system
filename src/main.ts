import './style.css'
import { supabase } from './lib/supabase'
import type { Profile } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!
type View = 'dashboard' | 'incoming' | 'outgoing' | 'tasks'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
const today=()=>new Date().toISOString().slice(0,10)
const functionUrl='https://uwebbofczidcfnjbvsqu.supabase.co/functions/v1/drive-file'
async function uploadMetadata(documentType:'incoming'|'outgoing'){
  const input=document.querySelector<HTMLInputElement>('#doc-file')
  const file=input?.files?.[0]
  if(!file)return
  const {data:{session}}=await supabase.auth.getSession()
  if(!session)return
  const response=await fetch(functionUrl,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({document_type:documentType,file_name:file.name,mime_type:file.type,file_size:file.size})})
  const result=await response.json().catch(()=>({}))
  const m=document.querySelector('#file-message')!
  m.textContent=response.ok&&result.ok?'เตรียมไฟล์สำเร็จ':'ยังไม่ได้เชื่อม Google Drive: '+(result.message||'กรุณาตั้งค่า Google Drive')
}

async function loadProfile(id:string):Promise<Profile|null>{const {data}=await supabase.from('profiles').select('*').eq('id',id).maybeSingle();return data}

function renderLogin(message=''){
 app.innerHTML='<main class="auth-shell"><section class="auth-card"><div class="brand">โรงเรียนอนุบาลชุมแสง</div><h1>ระบบสารบรรณอิเล็กทรอนิกส์</h1><p class="muted">วัดทับกฤชกลาง</p><form id="login-form"><label>อีเมล<input id="email" type="email" required></label><label>รหัสผ่าน<input id="password" type="password" required></label><button>เข้าสู่ระบบ</button><p class="error">'+esc(message)+'</p></form><button id="signup" class="secondary">สร้างบัญชีผู้ดูแลคนแรก</button></section></main>'
 document.querySelector<HTMLFormElement>('#login-form')!.onsubmit=async e=>{e.preventDefault();const email=(document.querySelector<HTMLInputElement>('#email')!).value;const password=(document.querySelector<HTMLInputElement>('#password')!).value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)renderLogin(error.message)}
 document.querySelector<HTMLButtonElement>('#signup')!.onclick=async()=>{const email=prompt('อีเมลผู้ดูแลระบบ');const password=prompt('รหัสผ่านอย่างน้อย 6 ตัวอักษร');if(!email||!password)return;const name=prompt('ชื่อผู้ดูแลระบบ')||email.split('@')[0];const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});if(error){renderLogin(error.message);return}if(data.user){const {data:r}=await supabase.from('roles').select('id').eq('code','admin').single();if(r)await supabase.from('user_roles').insert({user_id:data.user.id,role_id:r.id,assigned_by:data.user.id})}alert(data.session?'สร้างบัญชีสำเร็จ':'สร้างบัญชีสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ')}
}

async function saveDoc(kind:'incoming'|'outgoing',userId:string){
 const fd=new FormData(document.querySelector<HTMLFormElement>('#doc-form')!);
 const data=kind==='incoming'?{received_date:fd.get('date'),document_date:fd.get('documentDate')||null,subject:fd.get('subject'),sender:fd.get('sender')||null,priority:fd.get('priority'),description:fd.get('description')||null,created_by:userId}:{document_date:fd.get('date'),subject:fd.get('subject'),recipient:fd.get('recipient')||null,priority:fd.get('priority'),description:fd.get('description')||null,created_by:userId};
 const table=kind==='incoming'?'incoming_documents':'outgoing_documents';const {error}=await supabase.from(table).insert(data);
 const m=document.querySelector('#form-message')!;m.textContent=error?'บันทึกไม่สำเร็จ: '+error.message:'บันทึกเรียบร้อย';m.className=error?'error success-area':'success success-area';if(!error)(document.querySelector<HTMLFormElement>('#doc-form')!).reset()
}

async function documentForm(kind:'incoming'|'outgoing',userId:string){
 const incoming=kind==='incoming';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><main class="page"><button id="back" class="link-btn">← กลับหน้าหลัก</button><section class="panel form-panel"><h1>'+ (incoming?'ลงทะเบียนหนังสือรับ':'ลงทะเบียนหนังสือส่ง') +'</h1><p class="muted">เลขทะเบียนจะถูกสร้างอัตโนมัติ</p><form id="doc-form" class="form-grid"><label>วันที่<input name="date" type="date" value="'+today()+'" required></label>'+(incoming?'<label>วันที่หนังสือ<input name="documentDate" type="date"></label>':'')+'<label>เรื่อง<input name="subject" required></label><label>'+(incoming?'ผู้ส่ง':'ผู้รับ')+'<input name="'+(incoming?'sender':'recipient')+'"></label><label>ความเร่งด่วน<select name="priority"><option value="normal">ปกติ</option><option value="urgent">ด่วน</option><option value="very_urgent">ด่วนมาก</option></select></label><label class="full">รายละเอียด<textarea name="description" rows="5"></textarea></label><label class="full">ไฟล์เอกสาร<input id="doc-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"></label><p id="file-message" class="full muted">ไฟล์จะถูกจัดการผ่าน Google Drive เมื่อเชื่อมต่อบัญชีแล้ว</p><div class="full actions"><button>บันทึก</button></div><p id="form-message" class="full"></p></form></section></main></div>'
 document.querySelector('#back')!.addEventListener('click',()=>renderDashboard(userId,'dashboard'));document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelector<HTMLFormElement>('#doc-form')!.onsubmit=async e=>{e.preventDefault();await saveDoc(kind,userId);await uploadMetadata(kind)}
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
 const taskHtml=(assignments||[]).map((a:any)=>'<div class="row"><span>'+esc(peopleMap.get(a.assigned_to)||a.assigned_to)+'</span><span>'+esc(a.due_date||'-')+'</span><span>'+esc(a.status)+'</span><button class="secondary small" data-task="'+esc(a.id)+'">เสร็จสิ้น</button></div>').join('')||'<p class="muted">ยังไม่มีการมอบหมาย</p>'
 const options=(people||[]).map((p:any)=>'<option value="'+esc(p.id)+'">'+esc(p.full_name||p.id)+'</option>').join('')
 app.innerHTML='<div class="modal-backdrop"><section class="modal panel"><button id="close-detail" class="secondary">ปิด</button><h1>'+esc(d.document_no)+'</h1><p><strong>เรื่อง:</strong> '+esc(d.subject)+'</p><div class="detail-grid"><div><strong>วันที่:</strong> '+esc(kind==='incoming'?d.received_date:d.document_date)+'</div><div><strong>สถานะ:</strong> '+esc(d.status)+'</div><div><strong>'+(kind==='incoming'?'ผู้ส่ง':'ผู้รับ')+':</strong> '+esc(kind==='incoming'?d.sender:d.recipient)+'</div><div><strong>ความเร่งด่วน:</strong> '+esc(d.priority)+'</div></div><p>'+esc(d.description||'')+'</p><div class="panel"><h2>สถานะเอกสาร</h2><div class="actions"><select id="doc-status"><option value="pending">รอดำเนินการ</option><option value="received">รับเรื่องแล้ว</option><option value="in_progress">กำลังดำเนินการ</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิก</option></select><button id="save-doc-status">บันทึก</button></div></div><div class="panel"><h2>ไฟล์แนบ</h2>'+fileHtml+'</div><div class="panel"><h2>งานที่มอบหมาย</h2>'+taskHtml+'<hr><form id="assign-form" class="form-grid"><label>ผู้รับผิดชอบ<select name="assigned_to" required><option value="">เลือกผู้รับผิดชอบ</option>'+options+'</select></label><label>กำหนดส่ง<input name="due_date" type="date"></label><label class="full">หมายเหตุ<textarea name="note" rows="2"></textarea></label><div class="full"><button>มอบหมายงาน</button></div></form></div></section></div>'
 ;(document.querySelector<HTMLSelectElement>('#doc-status')!).value=d.status
 document.querySelector('#close-detail')!.addEventListener('click',()=>renderDashboard(userId,kind))
 document.querySelector('#save-doc-status')!.addEventListener('click',async()=>{const status=(document.querySelector<HTMLSelectElement>('#doc-status')!).value;const {error}=await supabase.from(table).update({status}).eq('id',id);if(error)alert('เปลี่ยนสถานะไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)})
 document.querySelector<HTMLFormElement>('#assign-form')!.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload:any={assigned_to:fd.get('assigned_to'),assigned_by:userId,due_date:fd.get('due_date')||null,note:fd.get('note')||null,status:'pending'};payload[fk]=id;const {error}=await supabase.from('assignments').insert(payload);if(error)alert('มอบหมายไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)}
 document.querySelectorAll<HTMLButtonElement>('[data-task]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('assignments').update({status:'completed'}).eq('id',b.dataset.task!);if(error)alert('อัปเดตงานไม่สำเร็จ: '+error.message);else await showDocument(kind,id,userId)})
}

async function renderDashboard(userId:string,view:View='dashboard'){
 const [p,inc,out,tasks,roles]=await Promise.all([loadProfile(userId),supabase.from('incoming_documents').select('id,document_no,received_date,subject,status').order('received_date',{ascending:false}).limit(20),supabase.from('outgoing_documents').select('id,document_no,document_date,subject,status').order('document_date',{ascending:false}).limit(20),supabase.from('assignments').select('id,due_date,status,note').eq('assigned_to',userId).neq('status','completed').order('due_date').limit(20),supabase.from('user_roles').select('roles(name)').eq('user_id',userId)]);
 const role=(roles.data?.[0] as any)?.roles?.name||'ผู้ใช้งาน';let content='';
 if(view==='dashboard')content='<section class="welcome"><h1>สวัสดี '+esc(p?.full_name||'ผู้ใช้งาน')+'</h1><p class="muted">บทบาท: '+esc(role)+'</p></section><section class="stats"><article><span>หนังสือรับ</span><strong>'+ (inc.data?.length||0) +'</strong></article><article><span>หนังสือส่ง</span><strong>'+ (out.data?.length||0) +'</strong></article><article><span>งานค้าง</span><strong>'+ (tasks.data?.length||0) +'</strong></article></section><section class="grid"><article class="panel"><h2>หนังสือรับล่าสุด</h2>'+listRows(inc.data||[],'received_date','incoming')+'</article><article class="panel"><h2>หนังสือส่งล่าสุด</h2>'+listRows(out.data||[],'document_date','outgoing')+'</article></section>';
 if(view==='incoming')content='<section class="welcome"><h1>หนังสือรับ</h1><p class="muted">ทะเบียนหนังสือรับล่าสุด</p></section><section class="panel"><div class="table-head"><b>เลขทะเบียน</b><b>วันที่</b><b>เรื่อง</b><b>สถานะ</b></div>'+listRows(inc.data||[],'received_date')+'</section>';
 if(view==='outgoing')content='<section class="welcome"><h1>หนังสือส่ง</h1><p class="muted">ทะเบียนหนังสือส่งล่าสุด</p></section><section class="panel"><div class="table-head"><b>เลขทะเบียน</b><b>วันที่</b><b>เรื่อง</b><b>สถานะ</b></div>'+listRows(out.data||[],'document_date')+'</section>';
 if(view==='tasks')content='<section class="welcome"><h1>งานของฉัน</h1><p class="muted">งานที่ยังไม่เสร็จ</p></section><section class="panel">'+((tasks.data||[]).map((d:any)=>{const doc=d.incoming_documents||d.outgoing_documents;const kind=d.incoming_document_id?'incoming':'outgoing';return '<div class="row clickable" data-task-doc="'+esc(d.incoming_document_id||d.outgoing_document_id||'')+'" data-task-kind="'+kind+'"><b>'+esc(d.due_date||'-')+'</b><span>'+esc(doc?.document_no||'')+' — '+esc(doc?.subject||d.note||'งานเอกสาร')+'</span><small>'+esc(d.status)+'</small></div>'}).join('')||'<p class="muted">ไม่มีงานค้าง</p>')+'</section>';
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button data-view="dashboard">ภาพรวม</button><button data-view="incoming">หนังสือรับ</button><button data-view="outgoing">หนังสือส่ง</button><button data-view="tasks">งานของฉัน</button><hr><button id="new-in">＋ ลงทะเบียนหนังสือรับ</button><button id="new-out">＋ ลงทะเบียนหนังสือส่ง</button></aside><main class="page">'+content+'</main></div></div>';
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut());document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>renderDashboard(userId,b.dataset.view as View));document.querySelector('#new-in')!.addEventListener('click',()=>documentForm('incoming',userId));document.querySelector('#new-out')!.addEventListener('click',()=>documentForm('outgoing',userId))
 document.querySelectorAll<HTMLElement>('[data-doc-id]').forEach(el=>el.addEventListener('click',()=>showDocument(el.dataset.docKind as 'incoming'|'outgoing',el.dataset.docId!,userId)))
}

async function ensureFirstAdmin(userId:string){const {data:roles}=await supabase.from('user_roles').select('role_id').eq('user_id',userId).limit(1);if(roles&&roles.length)return;const {data:r}=await supabase.from('roles').select('id').eq('code','admin').single();if(r)await supabase.from('user_roles').insert({user_id:userId,role_id:r.id,assigned_by:userId})}

async function boot(){const {data:{session}}=await supabase.auth.getSession();if(session?.user){await ensureFirstAdmin(session.user.id);await renderDashboard(session.user.id)}else renderLogin();supabase.auth.onAuthStateChange(async(_,s)=>{if(s?.user){await ensureFirstAdmin(s.user.id);await renderDashboard(s.user.id)}else renderLogin()})}
boot()