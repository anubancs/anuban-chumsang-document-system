import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'

const esc=(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] as string))
const norm=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase()
const personNorm=(v:unknown)=>norm(v).replace(/^(ผอ\.|นางสาว|นาง|นาย)\s*/,'').replace(/^รอง\s*[ฯ.]\s*/,'').replace(/\s+/g,'')
type CurrentUser={id:string;full_name:string|null;email:string|null;position:string|null;role_code?:string|null}
type LegacyUser={UserID:string;Username:string;FullName:string}

function rowsOf(wb:XLSX.WorkBook,name:string){const ws=wb.Sheets[name];return ws?XLSX.utils.sheet_to_json<any>(ws,{defval:''}):[]}
function excelDateToISO(v:unknown):unknown{
 if(v===null||v===undefined||v==='')return v
 if(v instanceof Date)return isNaN(v.getTime())?null:v.toISOString()
 if(typeof v==='number'&&isFinite(v)){
  const ms=Math.round((v-25569)*86400000)
  const d=new Date(ms)
  return isNaN(d.getTime())?null:d.toISOString()
 }
 if(typeof v==='string'){
  const s=v.trim()
  if(/^\\d+(?:\\.\\d+)?$/.test(s)){
   const n=Number(s);if(isFinite(n)&&n>20000&&n<80000){const d=new Date(Math.round((n-25569)*86400000));if(!isNaN(d.getTime()))return d.toISOString()}
  }
  return s
 }
 return v
}
function normalizeLegacyRow(sheet:string,x:any){
 const y={...x}
 if(sheet==='Documents'){y.Date_In=excelDateToISO(y.Date_In);y.Timestamp=excelDateToISO(y.Timestamp)}
 if(sheet==='Tasks'){y.Finish_Time=excelDateToISO(y.Finish_Time)}
 if(sheet==='Workflow_Logs'){y.Timestamp=excelDateToISO(y.Timestamp)}
 return y
}
function parseWorkbook(file:File):Promise<{Users:any[];Documents:any[];Workflow_Logs:any[];Tasks:any[]}>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{try{const wb=XLSX.read(r.result,{type:'array',cellDates:true});resolve({Users:rowsOf(wb,'Users').map(x=>normalizeLegacyRow('Users',x)),Documents:rowsOf(wb,'Documents').map(x=>normalizeLegacyRow('Documents',x)),Workflow_Logs:rowsOf(wb,'Workflow_Logs').map(x=>normalizeLegacyRow('Workflow_Logs',x)),Tasks:rowsOf(wb,'Tasks').map(x=>normalizeLegacyRow('Tasks',x))})}catch(e){reject(e)}};r.onerror=()=>reject(r.error);r.readAsArrayBuffer(file)})}

export async function renderLegacyMigration(userId:string,onBack:()=>void){
 const {data:profiles,error}=await supabase.from('profiles').select('id,full_name,email,position,user_roles!user_roles_user_id_fkey(roles!user_roles_role_id_fkey(code))').order('full_name')
 if(error){alert('โหลดรายชื่อบุคลากรไม่สำเร็จ: '+error.message);return}
 const current=(profiles||[]).map((x:any)=>({...x,role_code:x.user_roles?.[0]?.roles?.code||null})) as CurrentUser[]
 const app=document.querySelector<HTMLDivElement>('#app')!
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button id="back-migration">← กลับภาพรวม</button><button class="active">นำเข้าข้อมูลสารบรรณเดิม</button></aside><main class="page"><section class="welcome"><h1>นำเข้าข้อมูลสารบรรณจากระบบเดิม</h1><p class="muted">เลือกเฉพาะบุคลากรที่ยังมีบัญชีอยู่ในระบบใหม่ · ข้อมูลวันลาและโมดูลอื่นจะไม่ถูกนำเข้า</p></section><section class="panel" id="legacy-existing-batches">
<h2>1. ชุดข้อมูลที่เตรียมไว้แล้ว</h2>
<p class="muted">เลือก Batch ที่พักข้อมูลไว้แล้วเพื่อตรวจสอบก่อนนำเข้าจริง · ไม่ต้องอัปโหลดไฟล์ซ้ำ</p>
<div id="legacy-batch-list"><p class="muted">กำลังโหลดชุดข้อมูล...</p></div>
<div id="legacy-batch-result" style="margin-top:16px"></div>
</section>
<section class="panel"><h2>2. นำเข้าไฟล์ระบบเดิมชุดใหม่</h2><p class="muted">รองรับ Excel .xlsx/.xls · ระบบจะตรวจสอบและพักข้อมูลไว้ก่อน ยังไม่เขียนลงหนังสือรับ/ส่งจริง</p><input id="legacy-file" type="file" accept=".xlsx,.xls"><p id="legacy-file-message" class="muted"></p></section><section id="legacy-selection" class="panel" hidden></section></main></div></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelector('#back-migration')!.addEventListener('click',onBack)

 const renderExistingBatches=async()=>{
  const list=document.querySelector<HTMLElement>('#legacy-batch-list')
  const result=document.querySelector<HTMLElement>('#legacy-batch-result')
  if(!list)return
  const {data:batches,error}=await supabase.from('legacy_import_batches')
   .select('id,source_name,source_version,status,total_rows,imported_rows,skipped_rows,error_rows,created_at,completed_at')
   .order('created_at',{ascending:false}).limit(20)
  if(error){list.innerHTML='<p class="error">โหลด Batch ไม่สำเร็จ: '+esc(error.message)+'</p>';return}
  if(!batches?.length){list.innerHTML='<p class="muted">ยังไม่มี Batch ที่พักข้อมูลไว้</p>';return}
  list.innerHTML='<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ไฟล์</th><th>สถานะ</th><th>รายการ</th><th>นำเข้า</th><th>ข้าม</th><th>ผิดพลาด</th><th>การดำเนินการ</th></tr></thead><tbody>'+
   batches.map((b:any)=>'<tr><td>'+esc(new Date(b.created_at).toLocaleString('th-TH'))+'</td><td><strong>'+esc(b.source_name||'-')+'</strong><br><small>'+esc(b.id)+'</small></td><td>'+esc(b.status||'-')+'</td><td>'+esc(b.total_rows??0)+'</td><td>'+esc(b.imported_rows??0)+'</td><td>'+esc(b.skipped_rows??0)+'</td><td>'+esc(b.error_rows??0)+'</td><td><button class="secondary small" data-validate-batch="'+esc(b.id)+'">ตรวจสอบ Batch</button></td></tr>').join('')+
   '</tbody></table></div>'
  list.querySelectorAll<HTMLButtonElement>('[data-validate-batch]').forEach(btn=>btn.addEventListener('click',async()=>{
   const batchId=btn.dataset.validateBatch!
   const out=document.querySelector<HTMLElement>('#legacy-batch-result')!
   setBusy(btn,true,'กำลังตรวจสอบ...')
   out.innerHTML='<p class="muted">กำลัง Validate และตรวจสอบความซ้ำ/Identity Mapping...</p>'
   const {data:check,error:checkError}=await supabase.rpc('validate_legacy_import',{p_batch_id:batchId})
   setBusy(btn,false)
   if(checkError){out.innerHTML='<p class="error">ตรวจสอบไม่สำเร็จ: '+esc(checkError.message)+'</p>';return}
   const r:any=check||{}
   const ok=(r.errors??0)===0
   out.innerHTML='<div class="panel"><h3>ผลการตรวจสอบ Batch</h3>'+
    '<div class="detail-grid"><div><strong>ทั้งหมด:</strong> '+esc(r.total_rows??0)+'</div><div><strong>พร้อมนำเข้า:</strong> '+esc(r.ready_rows??0)+'</div><div><strong>รายการที่ต้องข้าม:</strong> '+esc(r.warnings??0)+'</div><div><strong>ผิดพลาด:</strong> '+esc(r.errors??0)+'</div><div><strong>ผู้สร้างหนังสือไม่พบ:</strong> '+esc(r.missing_creator??0)+'</div><div><strong>ผู้รับผิดชอบไม่พบ:</strong> '+esc(r.missing_assignee??0)+'</div><div><strong>หนังสือแม่ไม่พบ:</strong> '+esc(r.missing_parent??0)+'</div><div><strong>ผู้ดำเนินการ Workflow ไม่พบ:</strong> '+esc(r.missing_actor??0)+'</div><div><strong>หนังสือซ้ำ:</strong> '+esc(r.duplicate_documents??0)+'</div></div>'+
    '<p class="'+(ok?'success':'error')+'">'+(ok?'ผ่านการตรวจสอบขั้นต้น สามารถเตรียม Execute ได้':'ยังไม่ควร Execute เพราะมีรายการผิดพลาด')+'</p>'+
    '<div class="actions">'+(ok?'<button id="execute-existing-batch">ยืนยันนำเข้าข้อมูลจริง</button>':'')+'<button id="refresh-existing-batches" class="secondary">รีเฟรช Batch</button></div>'+
    '<p class="muted">ระบบจะไม่ย้ายไฟล์จาก Google Drive และจะเก็บ URL ไฟล์เดิมไว้เป็นข้อมูลอ้างอิง</p></div>'
   document.querySelector('#refresh-existing-batches')?.addEventListener('click',()=>renderExistingBatches())
   document.querySelector('#execute-existing-batch')?.addEventListener('click',async()=>{
    if(!confirm('ยืนยันนำเข้า Batch นี้เข้าสู่ข้อมูลจริง? การดำเนินการนี้จะสร้างหนังสือ งานมอบหมาย และประวัติ Workflow จากข้อมูลที่ผ่านการตรวจสอบแล้ว'))return
    const execBtn=document.querySelector<HTMLButtonElement>('#execute-existing-batch')
    if(execBtn)setBusy(execBtn,true,'กำลังนำเข้า...')
    out.querySelector('p:last-child')!.textContent='กำลังนำเข้าข้อมูลจริง... กรุณาอย่าปิดหน้าต่างนี้'
    const {data:execResult,error:execError}=await supabase.rpc('execute_legacy_import',{p_batch_id:batchId})
    if(execError){out.innerHTML+='<p class="error">นำเข้าไม่สำเร็จ: '+esc(execError.message)+'</p>';if(execBtn)setBusy(execBtn,false);return}
    const er:any=execResult||{}
    out.innerHTML+='<p class="success"><strong>นำเข้าเสร็จสิ้น</strong> · สถานะ '+esc(er.status||'completed')+' · นำเข้า '+esc(er.imported_rows??0)+' · ข้าม '+esc(er.skipped_rows??0)+' · ผิดพลาด '+esc(er.error_rows??0)+'</p>'
    await renderExistingBatches()
   })
  })
 }
 await renderExistingBatches()
 const fileInput=document.querySelector<HTMLInputElement>('#legacy-file')!
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];if(!file)return
  const msg=document.querySelector('#legacy-file-message')!
  try{
   msg.textContent='กำลังอ่านไฟล์และตรวจสอบข้อมูล...'
   const data=await parseWorkbook(file)
   const legacyUsers=(data.Users||[]).map((x:any)=>({UserID:String(x.UserID||'').trim(),Username:String(x.Username||'').trim(),FullName:String(x.FullName||'').trim()})).filter((x:LegacyUser)=>x.UserID)
   const nameGroups=new Map<string,CurrentUser[]>()
   current.forEach(x=>{const k=personNorm(x.full_name);if(!k)return;nameGroups.set(k,[...(nameGroups.get(k)||[]),x])})
   const currentByName=new Map<string,CurrentUser>();nameGroups.forEach((v,k)=>{if(v.length===1)currentByName.set(k,v[0])})
   const emailGroups=new Map<string,CurrentUser[]>()
   current.filter(x=>x.email).forEach(x=>{const k=norm(x.email);emailGroups.set(k,[...(emailGroups.get(k)||[]),x])})
   const currentByEmail=new Map<string,CurrentUser>();emailGroups.forEach((v,k)=>{if(v.length===1)currentByEmail.set(k,v[0])})
   const matchMap=new Map<string,CurrentUser>()
   for(const lu of legacyUsers){
    const emailHit=currentByEmail.get(norm(lu.Username))
    const nameHit=currentByName.get(personNorm(lu.FullName))
    let hit=emailHit||nameHit
    if(!emailHit && !nameHit){
      const candidates=(nameGroups.get(personNorm(lu.FullName))||[])
      const roleMap:any={Director:'director',Deputy:'deputy_director',Admin:'officer',PersonnelHead:'staff',AcademicHead:'staff',Teacher:'staff'}
      const wanted=roleMap[lu.Role]
      if(wanted){const roleHits=candidates.filter(x=>x.role_code===wanted);if(roleHits.length===1)hit=roleHits[0]}
    } else if(!emailHit){
      const candidates=nameGroups.get(personNorm(lu.FullName))||[]
      const roleMap:any={Director:'director',Deputy:'deputy_director',Admin:'officer',PersonnelHead:'staff',AcademicHead:'staff',Teacher:'staff'}
      const wanted=roleMap[lu.Role]
      if(wanted){const roleHits=candidates.filter(x=>x.role_code===wanted);if(roleHits.length===1)hit=roleHits[0]}
    }
    if(hit)matchMap.set(lu.UserID,hit)
   }
   const rows=current.map(p=>{
    const lus=legacyUsers.filter(x=>matchMap.get(x.UserID)?.id===p.id)
    const ids=new Set(lus.map(x=>x.UserID))
    const docs=data.Documents.filter(x=>ids.has(String(x.Created_By||'').trim())||data.Tasks.some(t=>String(t.AssigneeID||'').trim() && ids.has(String(t.AssigneeID||'').trim()) && String(t.DocID||'')===String(x.DocID||''))).length
    const tasks=data.Tasks.filter(x=>ids.has(String(x.AssigneeID||'').trim())).length
    const logs=data.Workflow_Logs.filter(x=>ids.has(String(x.ActorID||'').trim())).length
    return {p,lus,docs,tasks,logs}
   })
   const unmatchedLegacy=legacyUsers.filter(x=>!matchMap.has(x.UserID))
   const section=document.querySelector<HTMLElement>('#legacy-selection')!
   section.hidden=false
   section.innerHTML='<h2>2. เลือกบุคลากรที่จะนำข้อมูลเข้า</h2><div class="toolbar"><label><input id="select-all-legacy" type="checkbox"> เลือกทั้งหมดที่จับคู่ได้</label><span id="legacy-selected-count" class="muted"></span></div><div class="table-wrap"><table><thead><tr><th>เลือก</th><th>บุคลากรปัจจุบัน</th><th>ตำแหน่ง</th><th>รหัสเดิม</th><th>หนังสือ</th><th>งาน</th><th>Workflow</th><th>สถานะ</th></tr></thead><tbody>'+rows.map(({p,lus,docs,tasks,logs})=>'<tr><td><input class="legacy-person" type="checkbox" data-user-id="'+esc(p.id)+'" '+(lus.length?'':'disabled')+'></td><td><strong>'+esc(p.full_name||'-')+'</strong><br><small>'+esc(p.email||'')+'</small></td><td>'+esc(p.position||'-')+'</td><td>'+esc(lus.length?lus.map(x=>x.UserID).join(', '):'ไม่พบ')+'</td><td>'+docs+'</td><td>'+tasks+'</td><td>'+logs+'</td><td>'+(lus.length?'<span class="success">พบข้อมูลเดิม '+lus.length+' บัญชี</span>':'<span class="muted">ไม่มีข้อมูลตรงกัน</span>')+'</td></tr>').join('')+'</tbody></table></div><section class="panel" style="margin-top:16px"><h3>บุคลากรในระบบเดิมที่ไม่พบในระบบใหม่</h3><p class="muted">จะไม่สร้างบัญชีใหม่ และจะไม่ถูกนำเข้าในรอบนี้</p><div class="table-wrap"><table><thead><tr><th>รหัสเดิม</th><th>ชื่อ</th><th>Username</th></tr></thead><tbody>'+unmatchedLegacy.map(x=>'<tr><td>'+esc(x.UserID)+'</td><td>'+esc(x.FullName)+'</td><td>'+esc(x.Username)+'</td></tr>').join('')+'</tbody></table></div></section><div class="panel" style="margin-top:16px"><h3>3. ขอบเขตข้อมูล</h3><label><input id="include-documents" type="checkbox" checked> หนังสือรับ/ส่ง</label><label><input id="include-tasks" type="checkbox" checked> งานที่มอบหมาย</label><label><input id="include-workflows" type="checkbox" checked> ประวัติ Workflow</label><p class="muted">ไม่รวม Leaves, Research, Evaluation, Projects และโมดูลอื่น</p></div><div class="actions"><button id="stage-legacy">ตรวจสอบและพักข้อมูล</button></div><p id="legacy-stage-message"></p>'
   const updateCount=()=>{const n=document.querySelectorAll('.legacy-person:checked').length;document.querySelector('#legacy-selected-count')!.textContent='เลือก '+n+' คน'}
   document.querySelectorAll<HTMLInputElement>('.legacy-person').forEach(c=>c.addEventListener('change',updateCount))
   document.querySelector('#select-all-legacy')!.addEventListener('change',e=>{const on=(e.target as HTMLInputElement).checked;document.querySelectorAll<HTMLInputElement>('.legacy-person:not(:disabled)').forEach(c=>c.checked=on);updateCount()})
   updateCount()
   document.querySelector('#stage-legacy')!.addEventListener('click',async()=>{
    const selected=Array.from(document.querySelectorAll<HTMLInputElement>('.legacy-person:checked')).map(x=>x.dataset.userId!).filter(Boolean)
    const out=document.querySelector('#legacy-stage-message')!
    if(!selected.length){out.textContent='กรุณาเลือกบุคลากรอย่างน้อย 1 คน';out.className='error';return}
    const selectedLegacyIds=new Set<string>()
    legacyUsers.forEach(lu=>{const m=matchMap.get(lu.UserID);if(m&&selected.includes(m.id))selectedLegacyIds.add(lu.UserID)})
    const includeDocs=(document.querySelector<HTMLInputElement>('#include-documents')!).checked
    const includeTasks=(document.querySelector<HTMLInputElement>('#include-tasks')!).checked
    const includeWorkflows=(document.querySelector<HTMLInputElement>('#include-workflows')!).checked
    const {data:batch,error:batchError}=await supabase.from('legacy_import_batches').insert({source_name:file.name,source_version:'EDMS-only',started_by:userId,status:'staged'}).select('id').single()
    if(batchError){out.textContent='สร้างชุดนำเข้าไม่สำเร็จ: '+batchError.message;out.className='error';return}
    const records:any[]=[]
    for(const x of data.Users)if(selectedLegacyIds.has(String(x.UserID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Users',legacy_id:String(x.UserID).trim(),payload:x,status:'staged',target_table:'profiles'})
    const selectedTaskDocIds=new Set(data.Tasks.filter(x=>selectedLegacyIds.has(String(x.AssigneeID||'').trim())).map(x=>String(x.DocID||'').trim()).filter(Boolean))
    if(includeDocs)for(const x of data.Documents)if(selectedLegacyIds.has(String(x.Created_By||'').trim())||selectedTaskDocIds.has(String(x.DocID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Documents',legacy_id:String(x.DocID||'').trim(),payload:x,status:'staged',target_table:'documents'})
    if(includeTasks)for(const x of data.Tasks)if(selectedLegacyIds.has(String(x.AssigneeID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Tasks',legacy_id:String(x.TaskID||'').trim(),payload:x,status:'staged',target_table:'assignments'})
    const stagedDocIds=new Set(records.filter(x=>x.source_sheet==='Documents').map(x=>x.legacy_id))
    if(includeWorkflows)for(const x of data.Workflow_Logs)if(selectedLegacyIds.has(String(x.ActorID||'').trim())||stagedDocIds.has(String(x.DocID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Workflow_Logs',legacy_id:String(x.LogID||'').trim(),payload:x,status:'staged',target_table:'workflows'})
    let recError:any=null
    for(let i=0;i<records.length;i+=500){const {error}=await supabase.from('legacy_import_records').insert(records.slice(i,i+500));if(error){recError=error;break}}
    if(recError){await supabase.from('legacy_import_batches').update({status:'failed',error_rows:records.length}).eq('id',batch.id);out.textContent='พักข้อมูลไม่สำเร็จ: '+recError.message;out.className='error';return}
    const maps=Array.from(selectedLegacyIds).map(id=>{const lu=legacyUsers.find(x=>x.UserID===id)!;return {batch_id:batch.id,legacy_user_id:id,legacy_full_name:lu.FullName,current_user_id:matchMap.get(id)!.id,match_method:norm(lu.Username)===norm(matchMap.get(id)!.email)?'email':'full_name',is_confirmed:true}})
    if(maps.length){const {error}=await supabase.from('legacy_identity_map').insert(maps);if(error){out.textContent='บันทึก Identity Mapping ไม่สำเร็จ: '+error.message;out.className='error';return}}
    await supabase.from('legacy_import_batches').update({total_rows:records.length}).eq('id',batch.id)
    const {data:check,error:checkError}=await supabase.rpc('validate_legacy_import',{p_batch_id:batch.id})
    if(checkError){out.textContent='ตรวจสอบ Staging ไม่สำเร็จ: '+checkError.message;out.className='error';return}
    out.innerHTML='พักข้อมูลและตรวจสอบแล้ว · '+records.length+' รายการ<br><strong>พร้อมนำเข้า: '+esc((check as any)?.ready_rows??0)+' · ข้าม: '+esc((check as any)?.warnings??0)+' · ผิดพลาด: '+esc((check as any)?.errors??0)+'</strong><br><button id="execute-legacy" '+(((check as any)?.errors??0)>0?'disabled':'')+'>ยืนยันนำเข้าข้อมูลจริง</button>'
    out.className='success'
    document.querySelector('#execute-legacy')?.addEventListener('click',async()=>{
      if(!confirm('ยืนยันนำเข้าข้อมูลสารบรรณตามบุคลากรที่เลือก? ข้อมูลที่นำเข้าแล้วจะถูกบันทึกเป็นข้อมูลจริง และไม่ควรนำ Batch เดิมมาซ้ำ'))return
      const btn=document.querySelector<HTMLButtonElement>('#execute-legacy');if(btn)btn.disabled=true
      out.textContent='กำลังนำเข้าข้อมูล...'
      const {data:result,error}=await supabase.rpc('execute_legacy_import',{p_batch_id:batch.id})
      if(error){out.textContent='นำเข้าไม่สำเร็จ: '+error.message;out.className='error';return}
      out.innerHTML='นำเข้าสำเร็จ · สถานะ: <strong>'+esc((result as any)?.status||'completed')+'</strong><br>นำเข้า '+esc((result as any)?.imported_rows??0)+' รายการ · ข้าม '+esc((result as any)?.skipped_rows??0)+' · ผิดพลาด '+esc((result as any)?.error_rows??0)+'<br><button id="reload-legacy">โหลดไฟล์ใหม่</button>'
      document.querySelector('#reload-legacy')?.addEventListener('click',()=>location.reload())
    })
   })
  }catch(e){msg.textContent='อ่านไฟล์ไม่สำเร็จ: '+(e instanceof Error?e.message:'รูปแบบไฟล์ไม่ถูกต้อง');msg.className='error'}
 })
}
