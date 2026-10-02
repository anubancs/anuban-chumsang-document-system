import { createClient } from '@supabase/supabase-js'
import './style.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <h1>ระบบสารบรรณอิเล็กทรอนิกส์</h1>
    <p>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</p>
    <section class="card">
      <h2>ระบบพร้อมเริ่มต้น</h2>
      <p>ฐานข้อมูล Supabase เชื่อมต่อสำหรับขั้นตอนพัฒนาระบบถัดไป</p>
      <p id="status">กำลังตรวจสอบการตั้งค่า...</p>
    </section>
  </main>`

if (url && key) {
  const supabase = createClient(url, key)
  const { error } = await supabase.from('roles').select('code').limit(1)
  document.querySelector('#status')!.textContent = error
    ? 'เชื่อมต่อแล้ว แต่ต้องเข้าสู่ระบบเพื่อใช้งานข้อมูล'
    : 'เชื่อมต่อ Supabase สำเร็จ'
} else {
  document.querySelector('#status')!.textContent = 'กรุณาตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY'
}
