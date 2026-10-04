import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'

type ImportRow = {
  email:string
  full_name:string
  role_code:string
  position?:string
  leave_policy?:string
  password?:string
}

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
const roleLabels:Record<string,string>={admin:'ผู้ดูแลระบบ',director:'ผู้อำนวยการ',deputy_director:'รองผู้อำนวยการ',officer:'เจ้าหน้าที่สารบรรณ',staff:'ผู้ใช้งาน'}
const policyLabels:Record<string,string>={teacher_civil_servant:'ครู/บุคลากรทางการศึกษา',government_employee:'พนักงานราชการ/ลูกจ้างภาครัฐ',other:'อื่น ๆ'}
const normalize=(v:unknown)=>String(v??'').trim()
const key=(v:unknown)=>normalize(v).toLowerCase().replace(/\s+/g,'_')
const roleCode=(v:unknown)=>{
 const x=normalize(v).toLowerCase()
 const aliases:Record<string,string>={'ผู้ดูแลระบบ':'admin','ผู้อำนวยการ':'director','รองผู้อำนวยการ':'deputy_director','รองผู้อำนวยการโรงเรียน':'deputy_director','เจ้าหน้าที่สารบรรณ':'officer','ผู้ใช้งาน':'staff'}
 return aliases[x]||x
}
const policyCode=(v:unknown)=>{
 const x=normalize(v).toLowerCase()
 const aliases:Record<string,string>={'ครู/บุคลากรทางการศึกษา':'teacher_civil_servant','พนักงานราชการ/ลูกจ้างภาครัฐ':'government_employee','อื่น ๆ':'other','อื่นๆ':'other'}
 return aliases[x]||x||'other'
}
const headerMap:Record<string,string>={
 email:'email',อีเมล:'email',อีเมล์:'email',
 full_name:'full_name',name:'full_name',ชื่อ:'full_name',ชื่อผู้ใช้งาน:'full_name',
 role_code:'role_code',role:'role_code',บทบาท:'role_code',บทบาทผู้ใช้งาน:'role_code',
 position:'position',ตำแหน่ง:'position',ตำแหน่งหน้าที่:'position',
 leave_policy:'leave_policy',สิทธิการลา:'leave_policy',
 password:'password',รหัสผ่าน:'password',รหัสผ่านชั่วคราว:'password'
}
function mapRow(raw:Record<string,unknown>):ImportRow{
 const mapped:Record<string,unknown>={}
 for(const [k,v] of Object.entries(raw)){mapped[headerMap[key(k)]||key(k)]=v}
 return {
  email:normalize(mapped.email).toLowerCase(),
  full_name:normalize(mapped.full_name),
  role_code:roleCode(mapped.role_code||'staff'),
  position:normalize(mapped.position),
  leave_policy:policyCode(mapped.leave_policy),
  password:normalize(mapped.password)
 }
}
function validate(rows:ImportRow[]){
 const errors:string[]=[]
 const seen=new Set<string>()
 rows.forEach((r,i)=>{
  const n=i+2
  if(!/^\S+@\S+\.\S+$/.test(r.email))errors.push('แถว '+n+': อีเมลไม่ถูกต้อง')
  if(!r.full_name)errors.push('แถว '+n+': ไม่มีชื่อผู้ใช้งาน')
  if(!['admin','director','deputy_director','officer','staff'].includes(r.role_code))errors.push('แถว '+n+': บทบาทไม่ถูกต้อง')
  if(!['teacher_civil_servant','government_employee','other'].includes(r.leave_policy||'other'))errors.push('แถว '+n+': สิทธิการลาไม่ถูกต้อง')
  if(r.password&&r.password.length<6)errors.push('แถว '+n+': รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  if(seen.has(r.email))errors.push('แถว '+n+': อีเมลซ้ำในไฟล์')
  seen.add(r.email)
 })
 return errors
}
function template(){
 const rows=[
  ['email','full_name','role_code','position','leave_policy','password'],
  ['teacher@example.com','ตัวอย่าง ครู','staff','ครู','teacher_civil_servant',''],
 ]
 const wb=XLSX.utils.book_new()
 const ws=XLSX.utils.aoa_to_sheet(rows)
 XLSX.utils.book_append_sheet(wb,ws,'users')
 XLSX.writeFile(wb,'user-import-template.xlsx')
}
export async function renderUserImport(userId:string,onDone:()=>void){
 const app=document.querySelector<HTMLDivElement>('#app')!
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div><button id="logout" class="secondary">ออกจากระบบ</button></header><main class="page"><button id="back-users" class="link-btn">← กลับผู้ใช้งาน</button><section class="welcome"><h1>นำเข้าผู้ใช้งานจาก Excel</h1><p class="muted">ระบบจะสร้างบัญชี Auth โดยไม่ส่งอีเมล และสร้าง/ใช้รหัสผ่านชั่วคราวให้แต่ละคน</p></section><section class="panel form-panel"><div class="actions"><button id="download-template" class="secondary">ดาวน์โหลดแบบฟอร์ม Excel</button></div><p class="muted">คอลัมน์: email, full_name, role_code, position, leave_policy, password (password เว้นว่างได้ ระบบจะสร้างให้)</p><input id="user-import-file" type="file" accept=".xlsx,.xls" /><p id="user-import-message" class="muted"></p><div id="user-import-preview"></div><div class="actions"><button id="import-users-submit" disabled>นำเข้าผู้ใช้งาน</button></div></section></main></div>'
 document.querySelector('#logout')!.addEventListener('click',()=>supabase.auth.signOut())
 document.querySelector('#back-users')!.addEventListener('click',onDone)
 document.querySelector('#download-template')!.addEventListener('click',template)
 let rows:ImportRow[]=[]
 document.querySelector<HTMLInputElement>('#user-import-file')!.addEventListener('change',async e=>{
  const file=(e.target as HTMLInputElement).files?.[0]; if(!file)return
  const message=document.querySelector('#user-import-message')!
  try{
   const wb=XLSX.read(await file.arrayBuffer())
   const ws=wb.Sheets[wb.SheetNames[0]]
   rows=(XLSX.utils.sheet_to_json(ws,{defval:''}) as Record<string,unknown>[]).map(mapRow)
   const errors=validate(rows)
   const preview=document.querySelector('#user-import-preview')!
   if(!rows.length){message.textContent='ไม่พบข้อมูลในไฟล์';message.className='error';preview.innerHTML='';return}
   if(rows.length>200){message.textContent='นำเข้าได้ครั้งละไม่เกิน 200 รายการ';message.className='error';preview.innerHTML='';return}
   if(errors.length){message.textContent=errors.slice(0,20).join(' · ')+(errors.length>20?' · และอีก '+(errors.length-20)+' รายการ':'');message.className='error';preview.innerHTML='';(document.querySelector<HTMLButtonElement>('#import-users-submit')!).disabled=true;return}
   message.textContent='อ่านข้อมูลสำเร็จ '+rows.length+' รายการ';message.className='success'
   preview.innerHTML='<div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>ตำแหน่ง</th><th>สิทธิการลา</th></tr></thead><tbody>'+rows.slice(0,50).map(r=>'<tr><td>'+esc(r.full_name)+'</td><td>'+esc(r.email)+'</td><td>'+esc(roleLabels[r.role_code]||r.role_code)+'</td><td>'+esc(r.position||'-')+'</td><td>'+esc(policyLabels[r.leave_policy||'other'])+'</td></tr>').join('')+'</tbody></table></div>'+(rows.length>50?'<p class="muted">แสดงตัวอย่าง 50 จาก '+rows.length+' รายการ</p>':'')
   ;(document.querySelector<HTMLButtonElement>('#import-users-submit')!).disabled=false
  }catch(error){message.textContent='อ่าน Excel ไม่สำเร็จ: '+(error instanceof Error?error.message:'เกิดข้อผิดพลาด');message.className='error'}
 })
 document.querySelector<HTMLButtonElement>('#import-users-submit')!.addEventListener('click',async()=>{
  if(!rows.length)return
  const button=document.querySelector<HTMLButtonElement>('#import-users-submit')!
  button.disabled=true;button.textContent='กำลังสร้างบัญชี...'
  const {data:{session}}=await supabase.auth.getSession()
  if(!session){alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');return}
  const {data,error}=await supabase.functions.invoke('admin-users',{body:{action:'import_users',users:rows},headers:{Authorization:'Bearer '+session.access_token}})
  if(error||!data?.ok){button.disabled=false;button.textContent='นำเข้าผู้ใช้งาน';alert('นำเข้าไม่สำเร็จ: '+(data?.error||error?.message||'เกิดข้อผิดพลาด'));return}
  const created=(data.created||[]) as any[]
  const failed=(data.failed||[]) as any[]
  const passwordRows=created.filter(x=>x.password).map(x=>[x.email,x.full_name,x.password])
  if(passwordRows.length){
   const wb=XLSX.utils.book_new()
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['email','full_name','temporary_password'],...passwordRows]),'credentials')
   XLSX.writeFile(wb,'imported-user-temporary-passwords.xlsx')
  }
  const msg='สร้างผู้ใช้งานสำเร็จ '+created.length+' รายการ'+(failed.length?' · ไม่สำเร็จ '+failed.length+' รายการ':'')+' · ดาวน์โหลดไฟล์รหัสผ่านชั่วคราวแล้ว'
  alert(msg+'\n\nผู้ใช้ทุกคนต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก')
  await onDone()
 })
}
