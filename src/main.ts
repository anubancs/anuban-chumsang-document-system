import './style.css'
import { supabase } from './lib/supabase'
import type { Profile } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!

function renderLogin(message = '') {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand">โรงเรียนอนุบาลชุมแสง</div>
        <h1>ระบบสารบรรณอิเล็กทรอนิกส์</h1>
        <p class="muted">วัดทับกฤชกลาง</p>
        <form id="login-form">
          <label>อีเมล<input id="email" type="email" required autocomplete="email"></label>
          <label>รหัสผ่าน<input id="password" type="password" required autocomplete="current-password"></label>
          <button type="submit">เข้าสู่ระบบ</button>
          <p class="error" id="login-message">${message}</p>
        </form>
      </section>
    </main>`
  document.querySelector<HTMLFormElement>('#login-form')!.onsubmit = async (e) => {
    e.preventDefault()
    const email = (document.querySelector<HTMLInputElement>('#email')!).value
    const password = (document.querySelector<HTMLInputElement>('#password')!).value
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) renderLogin('เข้าสู่ระบบไม่สำเร็จ: ' + error.message)
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}

async function renderDashboard(user: { id: string; email?: string | undefined }) {
  const profile = await loadProfile(user.id)
  const [incoming, outgoing, assigned] = await Promise.all([
    supabase.from('incoming_documents').select('id', { count: 'exact', head: true }),
    supabase.from('outgoing_documents').select('id', { count: 'exact', head: true }),
    supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).neq('status', 'completed')
  ])
  app.innerHTML = `
    <main class="dashboard">
      <header class="topbar">
        <div><strong>ระบบสารบรรณอิเล็กทรอนิกส์</strong><small>โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)</small></div>
        <button id="logout" class="secondary">ออกจากระบบ</button>
      </header>
      <section class="welcome">
        <h1>สวัสดี ${profile?.full_name ?? user.email ?? 'ผู้ใช้งาน'}</h1>
        <p class="muted">ศูนย์กลางการรับ ส่ง มอบหมาย และติดตามเอกสาร</p>
      </section>
      <section class="stats">
        <article><span>หนังสือรับ</span><strong>${incoming.count ?? 0}</strong></article>
        <article><span>หนังสือส่ง</span><strong>${outgoing.count ?? 0}</strong></article>
        <article><span>งานที่ได้รับ</span><strong>${assigned.count ?? 0}</strong></article>
      </section>
      <section class="grid">
        <article class="panel"><h2>กำลังพัฒนา</h2><p>หน้าลงทะเบียนหนังสือรับ/ส่ง การมอบหมาย การอนุมัติ และ Google Drive จะเชื่อมต่อในขั้นถัดไป</p></article>
        <article class="panel"><h2>ความปลอดภัย</h2><p>ฐานข้อมูลใช้ Row Level Security และสิทธิ์ตามบทบาท ผู้ใช้ทั่วไปไม่สามารถข้าม RLS ได้</p></article>
      </section>
    </main>`
  document.querySelector<HTMLButtonElement>('#logout')!.onclick = async () => {
    await supabase.auth.signOut()
  }
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) await renderDashboard(session.user)
  else renderLogin()
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) await renderDashboard(session.user)
    else renderLogin()
  })
}

boot()
