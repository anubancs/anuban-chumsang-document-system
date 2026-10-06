import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'

const esc=(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] as string))
const norm=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase()
type CurrentUser={id:string;full_name:string|null;email:string|null;position:string|null}
type LegacyUser={UserID:string;Username:string;FullName:string}

function rowsOf(wb:XLSX.WorkBook,name:string){const ws=wb.Sheets[name];return ws?XLSX.utils.sheet_to_json<any>(ws,{defval:''}):[]}
function parseWorkbook(file:File):Promise<{Users:any[];Documents:any[];Workflow_Logs:any[];Tasks:any[]}>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{try{const wb=XLSX.read(r.result,{type:'array'});resolve({Users:rowsOf(wb,'Users'),Documents:rowsOf(wb,'Documents'),Workflow_Logs:rowsOf(wb,'Workflow_Logs'),Tasks:rowsOf(wb,'Tasks')})}catch(e){reject(e)}};r.onerror=()=>reject(r.error);r.readAsArrayBuffer(file)})}

export async function renderLegacyMigration(userId:string,onBack:()=>void){
 const {data:profiles,error}=await supabase.from('profiles').select('id,full_name,email,position').order('full_name')
 if(error){alert('โหลดรายชื่อบุคลากรไม่สำเร็จ: '+error.message);return}
 const current=(profiles||[]) as CurrentUser[]
 const app=document.querySelector<HTMLDivElement>('#app')!
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><div class="body-shell"><aside class="sidebar"><button id="back-migration">← กลับภาพรวม</button><button class="active">นำเข้าข้อมูลสารบรรณเดิม</button></aside><main class="page"><section class="welcome"><h1>นำเข้าข้อมูลสารบรรณจากระบบเดิม</h1><p class="muted">เลือกเฉพาะบุคลากรที่ยังมีบัญชีอยู่ในระบบใหม่ · ข้อมูลวันลาและโมดูลอื่นจะไม่ถูกนำเข้า</p></section><section class="panel"><h2>1. เลือกไฟล์ระบบเดิม</h2><p class="muted">รองรับ Excel .xlsx/.xls · ระบบจะตรวจสอบและพักข้อมูลไว้ก่อน ยังไม่เขียนลงหนังสือรับ/ส่งจริง</p><input id="legacy-file" type="file" accept=".xlsx,.xls"><p id="legacy-file-message" class="muted"></p></section><section id="legacy-selection" class="panel" hidden></section></main></div></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelector('#back-migration')!.addEventListener('click',onBack)
 const fileInput=document.querySelector<HTMLInputElement>('#legacy-file')!
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];if(!file)return
  const msg=document.querySelector('#legacy-file-message')!
  try{
   msg.textContent='กำลังอ่านไฟล์และตรวจสอบข้อมูล...'
   const data=await parseWorkbook(file)
   const legacyUsers=(data.Users||[]).map((x:any)=>({UserID:String(x.UserID||'').trim(),Username:String(x.Username||'').trim(),FullName:String(x.FullName||'').trim()})).filter((x:LegacyUser)=>x.UserID)
   const currentByName=new Map(current.map(x=>[norm(x.full_name),x]))
   const currentByEmail=new Map(current.filter(x=>x.email).map(x=>[norm(x.email),x]))
   const matchMap=new Map<string,CurrentUser>()
   for(const lu of legacyUsers){
    const hit=currentByEmail.get(norm(lu.Username))||currentByName.get(norm(lu.FullName))
    if(hit)matchMap.set(lu.UserID,hit)
   }
   const rows=current.map(p=>{
    const lu=legacyUsers.find(x=>matchMap.get(x.UserID)?.id===p.id)
    const docs=lu?data.Documents.filter(x=>String(x.Created_By||'').trim()===lu.UserID).length:0
    const tasks=lu?data.Tasks.filter(x=>String(x.AssigneeID||'').trim()===lu.UserID).length:0
    const logs=lu?data.Workflow_Logs.filter(x=>String(x.ActorID||'').trim()===lu.UserID).length:0
    return {p,lu,docs,tasks,logs}
   })
   const unmatchedLegacy=legacyUsers.filter(x=>!matchMap.has(x.UserID))
   const section=document.querySelector<HTMLElement>('#legacy-selection')!
   section.hidden=false
   section.innerHTML='<h2>2. เลือกบุคลากรที่จะนำข้อมูลเข้า</h2><div class="toolbar"><label><input id="select-all-legacy" type="checkbox"> เลือกทั้งหมดที่จับคู่ได้</label><span id="legacy-selected-count" class="muted"></span></div><div class="table-wrap"><table><thead><tr><th>เลือก</th><th>บุคลากรปัจจุบัน</th><th>ตำแหน่ง</th><th>รหัสเดิม</th><th>หนังสือ</th><th>งาน</th><th>Workflow</th><th>สถานะ</th></tr></thead><tbody>'+rows.map(({p,lu,docs,tasks,logs})=>'<tr><td><input class="legacy-person" type="checkbox" data-user-id="'+esc(p.id)+'" data-legacy-id="'+esc(lu?.UserID||'')+'" '+(lu?'':'disabled')+'></td><td><strong>'+esc(p.full_name||'-')+'</strong><br><small>'+esc(p.email||'')+'</small></td><td>'+esc(p.position||'-')+'</td><td>'+esc(lu?.UserID||'ไม่พบ')+'</td><td>'+docs+'</td><td>'+tasks+'</td><td>'+logs+'</td><td>'+(lu?'<span class="success">พบข้อมูลเดิม</span>':'<span class="muted">ไม่มีข้อมูลตรงกัน</span>')+'</td></tr>').join('')+'</tbody></table></div><section class="panel" style="margin-top:16px"><h3>บุคลากรในระบบเดิมที่ไม่พบในระบบใหม่</h3><p class="muted">จะไม่สร้างบัญชีใหม่ และจะไม่ถูกนำเข้าในรอบนี้</p><div class="table-wrap"><table><thead><tr><th>รหัสเดิม</th><th>ชื่อ</th><th>Username</th></tr></thead><tbody>'+unmatchedLegacy.map(x=>'<tr><td>'+esc(x.UserID)+'</td><td>'+esc(x.FullName)+'</td><td>'+esc(x.Username)+'</td></tr>').join('')+'</tbody></table></div></section><div class="panel" style="margin-top:16px"><h3>3. ขอบเขตข้อมูล</h3><label><input id="include-documents" type="checkbox" checked> หนังสือรับ/ส่ง</label><label><input id="include-tasks" type="checkbox" checked> งานที่มอบหมาย</label><label><input id="include-workflows" type="checkbox" checked> ประวัติ Workflow</label><p class="muted">ไม่รวม Leaves, Research, Evaluation, Projects และโมดูลอื่น</p></div><div class="actions"><button id="stage-legacy">ตรวจสอบและพักข้อมูล</button></div><p id="legacy-stage-message"></p>'
   const updateCount=()=>{const n=document.querySelectorAll('.legacy-person:checked').length;document.querySelector('#legacy-selected-count')!.textContent='เลือก '+n+' คน'}
   document.querySelectorAll<HTMLInputElement>('.legacy-person').forEach(c=>c.addEventListener('change',updateCount))
   document.querySelector('#select-all-legacy')!.addEventListener('change',e=>{const on=(e.target as HTMLInputElement).checked;document.querySelectorAll<HTMLInputElement>('.legacy-person:not(:disabled)').forEach(c=>c.checked=on);updateCount()})
   updateCount()
   document.querySelector('#stage-legacy')!.addEventListener('click',async()=>{
    const selected=Array.from(document.querySelectorAll<HTMLInputElement>('.legacy-person:checked')).map(x=>x.dataset.userId!).filter(Boolean)
    const out=document.querySelector('#legacy-stage-message')!
    if(!selected.length){out.textContent='กรุณาเลือกบุคลากรอย่างน้อย 1 คน';out.className='error';return}
    const selectedLegacyIds=new Set<string>()
    current.forEach(p=>{if(selected.includes(p.id)){const lu=legacyUsers.find(x=>matchMap.get(x.UserID)?.id===p.id);if(lu)selectedLegacyIds.add(lu.UserID)}})
    const includeDocs=(document.querySelector<HTMLInputElement>('#include-documents')!).checked
    const includeTasks=(document.querySelector<HTMLInputElement>('#include-tasks')!).checked
    const includeWorkflows=(document.querySelector<HTMLInputElement>('#include-workflows')!).checked
    const {data:batch,error:batchError}=await supabase.from('legacy_import_batches').insert({source_name:file.name,source_version:'EDMS-only',started_by:userId,status:'staged'}).select('id').single()
    if(batchError){out.textContent='สร้างชุดนำเข้าไม่สำเร็จ: '+batchError.message;out.className='error';return}
    const records:any[]=[]
    for(const x of data.Users)if(selectedLegacyIds.has(String(x.UserID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Users',legacy_id:String(x.UserID).trim(),payload:x,status:'staged',target_table:'profiles'})
    if(includeDocs)for(const x of data.Documents)if(selectedLegacyIds.has(String(x.Created_By||'').trim()))records.push({batch_id:batch.id,source_sheet:'Documents',legacy_id:String(x.DocID||'').trim(),payload:x,status:'staged',target_table:'documents'})
    if(includeTasks)for(const x of data.Tasks)if(selectedLegacyIds.has(String(x.AssigneeID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Tasks',legacy_id:String(x.TaskID||'').trim(),payload:x,status:'staged',target_table:'assignments'})
    if(includeWorkflows)for(const x of data.Workflow_Logs)if(selectedLegacyIds.has(String(x.ActorID||'').trim()))records.push({batch_id:batch.id,source_sheet:'Workflow_Logs',legacy_id:String(x.LogID||'').trim(),payload:x,status:'staged',target_table:'workflows'})
    const {error:recError}=records.length?await supabase.from('legacy_import_records').insert(records):{error:null}
    if(recError){await supabase.from('legacy_import_batches').update({status:'failed',error_rows:records.length}).eq('id',batch.id);out.textContent='พักข้อมูลไม่สำเร็จ: '+recError.message;out.className='error';return}
    const maps=Array.from(selectedLegacyIds).map(id=>{const lu=legacyUsers.find(x=>x.UserID===id)!;return {batch_id:batch.id,legacy_user_id:id,legacy_full_name:lu.FullName,current_user_id:matchMap.get(id)!.id,match_method:norm(lu.Username)===norm(matchMap.get(id)!.email)?'email':'full_name',is_confirmed:true}})
    if(maps.length){const {error}=await supabase.from('legacy_identity_map').insert(maps);if(error){out.textContent='บันทึก Identity Mapping ไม่สำเร็จ: '+error.message;out.className='error';return}}
    await supabase.from('legacy_import_batches').update({total_rows:records.length}).eq('id',batch.id)
    out.textContent='พักข้อมูลสำเร็จ '+records.length+' รายการ · ยังไม่มีการเขียนทับข้อมูลสารบรรณจริง';out.className='success'
   })
  }catch(e){msg.textContent='อ่านไฟล์ไม่สำเร็จ: '+(e instanceof Error?e.message:'รูปแบบไฟล์ไม่ถูกต้อง');msg.className='error'}
 })
}
