# เว็บไซต์โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)

เว็บไซต์โรงเรียนแบบ Serverless ใช้ Supabase PostgreSQL/Auth/RLS, Google Drive + Apps Script, Telegram Bot และ Frontend แบบ Static HTML/Tailwind/JavaScript

## สถาปัตยกรรม

- **Frontend:** HTML5, Tailwind CSS CDN, JavaScript ES2022
- **Database/Auth:** Supabase PostgreSQL, Auth, RLS และ Realtime
- **ไฟล์:** Google Drive (ไม่ใช้ Supabase Storage)
- **Business Logic/Notification:** Google Apps Script และ Telegram Bot API
- **Hosting:** GitHub Pages หรือ Vercel
- **ห้ามใส่ Supabase service_role / sb_secret หรือ Telegram Bot Token ใน Frontend**

## หน้าเว็บไซต์

- `index.html` — หน้าแรกและข่าวล่าสุด
- `news.html`, `news-detail.html` — ข่าวประชาสัมพันธ์
- `personnel.html`, `teacher-profile.html` — ทำเนียบบุคลากรและลิงก์เว็บไซต์ส่วนตัว
- `classes.html` — ข้อมูลภาพรวมระดับชั้น/ห้องเรียน (ไม่แสดงข้อมูลรายบุคคล)
- `downloads.html` — ดาวน์โหลดเอกสาร
- `gallery.html` — ภาพกิจกรรม
- `contact.html` — แบบฟอร์มติดต่อ
- `admin/login.html`, `admin/dashboard.html` — ระบบผู้ดูแลข่าวและบุคลากร\n- `admin/library.html` — จัดการเอกสาร ดาวน์โหลด แกลเลอรี และกิจกรรม\n- `.github/workflows/validate.yml` — ตรวจไวยากรณ์ JavaScript อัตโนมัติเมื่อ Push/PR

## ตั้งค่า Supabase

โปรเจกต์ที่เชื่อมต่ออยู่: `uwebbofczidcfnjbvsqu` (region `ap-southeast-1`)

1. ตรวจสอบตารางและ RLS ใน Supabase Dashboard ก่อนใช้งาน
2. Frontend ใช้ URL และ Publishable Key ใน `assets/js/supabase.js` ได้ เพราะเป็นค่าที่เปิดเผยต่อ Browser โดยตั้ง RLS เป็นแนวป้องกันหลัก
3. ห้ามเผยแพร่ Secret Key หรือ Service Role Key
4. เลือกบัญชี Auth ที่เชื่อถือได้ แล้วเพิ่ม UUID ของบัญชีนั้นเป็น Owner ด้วย SQL:

```sql
insert into public.admin_users(user_id, role)
values ('AUTH_USER_UUID', 'owner')
on conflict (user_id) do update set role = excluded.role;
```

5. ตั้งค่า Auth Site URL และ Redirect URLs ให้ตรงกับ URL ที่ Deploy จริง

ไฟล์ `supabase/schema.sql` เป็น SQL สำหรับอ้างอิง/ติดตั้งบนโปรเจกต์ใหม่ที่สะอาด ไม่ควรรันซ้ำบนโปรเจกต์ที่มี Migration ติดตั้งแล้ว

## ตั้งค่า Google Drive และ Apps Script

1. สร้างโฟลเดอร์ Google Drive สำหรับเอกสารที่ต้องการเผยแพร่
2. เปิด [Google Apps Script](https://script.google.com/) สร้าง Project แล้วคัดลอก `gas/Code.gs`
3. ตั้ง Script Properties:
   - `DRIVE_FOLDER_ID` — Folder ID
   - `TELEGRAM_BOT_TOKEN` — Token จาก @BotFather
   - `TELEGRAM_CHAT_ID` — Chat ID ของกลุ่ม/ช่องทาง
4. Deploy เป็น Web App โดย Execute as: Me
5. จำกัดการเข้าถึงให้เหมาะสมกับการใช้งานจริง
6. นำ URL ที่ลงท้ายด้วย `/exec` ไปกำหนดใน `assets/js/api.js` ที่ `window.SCHOOL_GAS_WEB_APP_URL`

**ข้อควรระวัง:** GAS Web App ที่เปิดให้บุคคลทั่วไปเรียกได้อาจถูกส่งข้อความขยะได้ ควรเพิ่มการป้องกันสแปม/จำกัดอัตราการเรียกก่อนเปิดใช้ Telegram แจ้งเตือนจริง

## ตั้งค่า Telegram Bot

1. เปิด Telegram ค้นหา `@BotFather` แล้วใช้คำสั่ง `/newbot`
2. เก็บ Bot Token ใน Script Properties เท่านั้น
3. เพิ่ม Bot เข้า Group/Channel และให้สิทธิ์ส่งข้อความ
4. ตรวจสอบ Chat ID จากการอัปเดตของ Bot หรือใช้วิธีทดสอบที่เชื่อถือได้
5. ทดสอบส่งข้อความในกลุ่มส่วนตัวก่อนใช้จริง

## Deploy

### GitHub Pages

Repository นี้เป็น **Private** อยู่ในขณะนี้ การใช้ GitHub Pages ฟรีกับ Private Repository ขึ้นกับแผน GitHub ที่บัญชีมี หากเป็น GitHub Free จะต้องใช้ Repository สาธารณะจึงจะใช้ Pages ฟรีได้ อย่าเปลี่ยน Repository เป็น Public โดยไม่ได้รับอนุญาต

หากบัญชีมีสิทธิ์ Pages:
1. GitHub Repository → Settings → Pages
2. เลือก Deploy from a branch
3. เลือก Branch `main` และ Folder `/ (root)`
4. Save และรอ URL ที่ GitHub แจ้ง

### Vercel

1. เข้าสู่ Vercel และ Import Repository นี้
2. เลือก Framework Preset: Other
3. Build Command: เว้นว่าง
4. Output Directory: `.`
5. Deploy แล้วนำ URL ไปตั้งใน Supabase Auth Redirect URLs

## การทดสอบก่อนเปิดใช้งานจริง

- ทดสอบอ่านข้อมูลด้วยผู้เยี่ยมชมที่ยังไม่ Login
- ทดสอบ Login ด้วยบัญชี Admin และบัญชีที่ไม่มีสิทธิ์
- ทดสอบเพิ่ม/แก้ไข/ลบข้อมูลแต่ละโมดูล
- ทดสอบฟอร์มติดต่อและ Telegram
- ทดสอบ URL/สิทธิ์แชร์ไฟล์ Google Drive จาก Browser ที่ไม่ Login
- ทดสอบ Mobile, SEO metadata, keyboard accessibility และ Dark Mode
- ตรวจ Security Advisor และตั้งค่าป้องกันสแปมก่อนเปิดสู่สาธารณะ

## ข้อจำกัดปัจจุบัน

AI Chatbot, AI Summary, AI Document Search, CRUD เต็มรูปแบบสำหรับทุกโมดูล, การจัดการ Drive แบบครบวงจร และการทดสอบ End-to-End ยังไม่ถือว่าเสร็จ ต้องติดตั้งและทดสอบก่อนใช้งานจริง
