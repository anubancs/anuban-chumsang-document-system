# เว็บไซต์โรงเรียนอนุบาลชุมแสง (วัดทับกฤชกลาง)

เว็บไซต์โรงเรียนแบบ Serverless ใช้ Supabase PostgreSQL/Auth/RLS, Google Drive + Apps Script, Telegram Bot และ Frontend แบบ Static HTML/Tailwind/JavaScript โดยไม่ใช้ Supabase Storage

## สถาปัตยกรรม

- **Frontend:** HTML5, Tailwind CSS CDN, JavaScript ES2022
- **Database/Auth:** Supabase PostgreSQL, Auth, RLS และ Realtime
- **ไฟล์:** Google Drive (ไม่ใช้ Supabase Storage)
- **Business Logic/Notification:** Google Apps Script และ Telegram Bot API
- **Hosting:** GitHub Pages
- **ห้ามใส่ Supabase service_role / sb_secret หรือ Telegram Bot Token ใน Frontend**

## หน้าเว็บไซต์

- `index.html` — หน้าแรกและข่าวล่าสุด
- `news.html`, `news-detail.html` — ข่าวประชาสัมพันธ์
- `personnel.html`, `teacher-profile.html` — ทำเนียบบุคลากรและลิงก์เว็บไซต์ส่วนตัว
- `classes.html` — ข้อมูลภาพรวมระดับชั้น/ห้องเรียน (ไม่แสดงข้อมูลรายบุคคล)
- `downloads.html` — ดาวน์โหลดเอกสาร
- `gallery.html` — ภาพกิจกรรม
- `contact.html` — แบบฟอร์มติดต่อ
- `admin/login.html`, `admin/dashboard.html` — เข้าสู่ระบบและจัดการข่าว/บุคลากร
- `admin/library.html` — จัดการเอกสาร ดาวน์โหลด แกลเลอรี และกิจกรรม
- `admin/messages.html` — กล่องข้อความจากแบบฟอร์มติดต่อ
- `.github/workflows/validate.yml` — ตรวจ JavaScript, inline scripts และลิงก์/ไฟล์ภายในอัตโนมัติ

## สถานะการติดตั้ง

- GitHub Pages: workflow ล่าสุดผ่านแล้ว และเว็บไซต์เผยแพร่ที่ [https://anubancs.github.io/](https://anubancs.github.io/)
- Supabase Project: `uwebbofczidcfnjbvsqu` (region `ap-southeast-1`) สถานะ ACTIVE_HEALTHY
- ตารางสาธารณะทุกตารางเปิดใช้ RLS แล้ว
- บัญชี Owner ถูกกำหนดไว้แล้วใน `public.admin_users`
- **ยังต้องทำ:** ตั้งค่า Auth URL, ทดสอบการเข้าสู่ระบบจริง, Deploy Google Apps Script/ตั้ง Script Properties และเพิ่มข้อมูลจริงของโรงเรียน
- CI ผ่านเป็นการตรวจโค้ดแบบ Static ไม่ใช่การทดสอบ End-to-End ใน Browser

## ตั้งค่า Supabase

โปรเจกต์ที่เชื่อมต่ออยู่: `uwebbofczidcfnjbvsqu`

1. เปิด [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/uwebbofczidcfnjbvsqu/auth/url-configuration)
2. ตั้ง **Site URL** เป็น `https://anubancs.github.io`
3. เพิ่ม **Redirect URL** แบบเจาะจงเป็น `https://anubancs.github.io/admin/login.html`
4. ตรวจสอบ `assets/js/supabase.js` ว่าใช้ Project URL และ Publishable Key ของโปรเจกต์นี้อยู่แล้ว
5. บัญชีผู้ดูแล Owner ที่มีอยู่แล้ว ให้เปิด [หน้าเข้าสู่ระบบผู้ดูแล](https://anubancs.github.io/admin/login.html) กรอกอีเมล แล้วกด “ลืมรหัสผ่าน / ตั้งรหัสผ่านครั้งแรก” เพื่อรับอีเมล จากนั้นเปิดลิงก์และกำหนดรหัสผ่านใหม่อย่างน้อย 10 ตัวอักษร
6. หลังตั้งรหัสผ่านแล้ว ให้กลับมาเข้าสู่ระบบและตรวจว่าหน้า Dashboard เปิดได้

**ความปลอดภัย:** ตารางใน `public` เปิดใช้ RLS และใช้ policy จำกัดการอ่าน/เขียนตามสถานะเนื้อหาและสิทธิ์ผู้ดูแล ห้ามนำ Secret Key หรือ Service Role Key ไปใส่ในไฟล์ Frontend

**Leaked Password Protection:** Security Advisor ตรวจพบว่ายังปิดอยู่ แต่เอกสาร Supabase ระบุว่าการป้องกันรหัสผ่านรั่วไหลผ่าน HaveIBeenPwned มีให้ใน Pro Plan ขึ้นไป จึงอาจเปิดไม่ได้ในแผน Free โดยไม่อัปเกรด ดู [เอกสาร Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

ไฟล์ `supabase/schema.sql` เป็น SQL สำหรับอ้างอิง/ติดตั้งบนโปรเจกต์ใหม่ที่สะอาด **ไม่ควรรันซ้ำ** บนโปรเจกต์ปัจจุบันที่ติดตั้ง Migration แล้ว

## ตั้งค่า Google Drive และ Apps Script

1. สร้างโฟลเดอร์ Google Drive สำหรับเอกสารที่ต้องการเผยแพร่
2. เปิด [Google Apps Script](https://script.google.com/) สร้าง Project แล้วคัดลอกเนื้อหาใน `gas/Code.gs`
3. ตั้ง Script Properties ต่อไปนี้ใน Project Settings:
   - `DRIVE_FOLDER_ID` — Folder ID ของโฟลเดอร์ที่อนุญาตให้เผยแพร่
   - `TELEGRAM_BOT_TOKEN` — Token จาก @BotFather
   - `TELEGRAM_CHAT_ID` — Chat ID ของกลุ่ม/ช่องทาง
4. Deploy เป็น Web App โดย Execute as: Me และกำหนดการเข้าถึงให้เหมาะสม
5. นำ URL ที่ลงท้ายด้วย `/exec` ไปกำหนดใน `assets/js/api.js` ที่ `window.SCHOOL_GAS_WEB_APP_URL`

**ข้อควรระวัง:** GAS Web App ที่เปิดให้บุคคลทั่วไปเรียกได้อาจถูกส่งข้อความขยะได้ โค้ดปัจจุบันมี validation, honeypot และ throttling เบื้องต้น แต่ยังไม่ใช่ระบบป้องกันสแปมระดับสูง ควรทดสอบในกลุ่ม Telegram ส่วนตัวก่อนใช้งานจริง


## ตั้งค่าระบบ AI Chatbot

ระบบผู้ช่วย AI ใช้ Google Apps Script เป็นตัวกลางเรียก Gemini API โดยไม่ส่ง API Key ไปยัง Browser

1. สร้าง Gemini API Key ใน [Google AI Studio](https://aistudio.google.com/app/apikey)
2. เปิด Apps Script Project เดิมที่ใช้เชื่อม Google Drive
3. ไปที่ **Project Settings → Script Properties** แล้วเพิ่ม:
   - `GEMINI_API_KEY` — API Key จาก Google AI Studio (เก็บเป็นความลับ ห้ามใส่ใน GitHub)
   - `SUPABASE_PUBLISHABLE_KEY` — ใช้ค่า Publishable Key เดิมที่ตั้งไว้สำหรับอัปโหลดภาพ
   - `GEMINI_MODEL` — ไม่บังคับ ค่าเริ่มต้น `gemini-2.5-flash`
   - `AI_DAILY_LIMIT` — ไม่บังคับ ค่าเริ่มต้น 100 คำถามต่อวัน
4. คัดลอกโค้ดล่าสุดจาก `gas/Code.gs` ใน GitHub ไปแทนที่โค้ดใน Apps Script Project เดิม แล้วบันทึก
5. เลือก **Deploy → Manage deployments → Edit → New version → Deploy** เพื่อให้ Web App ใช้โค้ดล่าสุด (URL เดิมไม่ต้องเปลี่ยน)
6. เปิดเว็บไซต์หน้าแรกแล้วกดปุ่ม **ถาม AI โรงเรียน** เพื่อทดสอบ

**ข้อจำกัดและความปลอดภัย**
- Chatbot ตอบจากข้อมูลสาธารณะที่เผยแพร่ใน Supabase เท่านั้น ได้แก่ ข่าว บุคลากร เอกสาร กิจกรรม และภาพกิจกรรม
- ไม่อ่านข้อมูลผู้ดูแล ข้อความติดต่อ หรือข้อมูลนักเรียนรายบุคคล
- มีการจำกัดจำนวนคำถามต่อ client session และโควตารวมรายวันเบื้องต้น แต่ยังไม่ใช่ระบบป้องกันการโจมตีแบบสมบูรณ์ ควรตั้ง `AI_DAILY_LIMIT` ให้เหมาะกับงบประมาณและตรวจสอบ Usage ใน Google AI Studio
- API Key ต้องอยู่ใน Script Properties เท่านั้น หากพบว่ารั่วไหลให้เพิกถอนและสร้างใหม่ทันที
- โมเดลและโควตา Gemini อาจเปลี่ยนตามนโยบายผู้ให้บริการ

## ตั้งค่า Telegram Bot

1. เปิด Telegram ค้นหา `@BotFather` แล้วใช้คำสั่ง `/newbot`
2. เก็บ Bot Token ใน Script Properties เท่านั้น ห้าม commit ลง GitHub
3. เพิ่ม Bot เข้า Group/Channel และให้สิทธิ์ส่งข้อความ
4. ตรวจสอบ Chat ID และทดสอบส่งข้อความในกลุ่มส่วนตัวก่อน

## Deploy และตรวจสอบ

- เว็บไซต์หลัก: [https://anubancs.github.io/](https://anubancs.github.io/)
- หน้าเข้าสู่ระบบผู้ดูแล: [https://anubancs.github.io/admin/login.html](https://anubancs.github.io/admin/login.html)
- กล่องข้อความผู้ดูแล: [https://anubancs.github.io/admin/messages.html](https://anubancs.github.io/admin/messages.html)
- GitHub Actions: [ตรวจสอบ CI และ Deployment](https://github.com/anubancs/anubancs.github.io/actions)

## ข้อจำกัดที่ยังไม่เสร็จ

- ยังไม่มีข่าว บุคลากร เอกสาร แกลเลอรี และกิจกรรมจริงในฐานข้อมูล จึงจะแสดงสถานะว่างจนกว่าจะเพิ่มข้อมูล
- Google Apps Script ยังต้อง Deploy และตั้งค่า Script Properties โดยเจ้าของบัญชี Google
- ยังต้องทดสอบ Login, reset password, CRUD และฟอร์มติดต่อจริงใน Browser
- AI Chatbot, AI Summary และ AI Document Search ยังไม่ได้เชื่อมต่อ
- ยังไม่มีการทดสอบ End-to-End อัตโนมัติ
