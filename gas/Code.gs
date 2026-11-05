/**
 * School Google Drive image gateway. Images are public by link because the website displays them.
 * Script Properties: DRIVE_FOLDER_ID (optional), SUPABASE_PUBLISHABLE_KEY,
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (the last two are optional).
 */
const DEFAULT_DRIVE_FOLDER_ID = '1ptff4TPbIh9hlCwss4Fxg-lVpZfI33j8';
const SUPABASE_URL = 'https://uwebbofczidcfnjbvsqu.supabase.co';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];

function doGet(e) {
  const action = e && e.parameter && e.parameter.action || 'health';
  if (action === 'health') return json_({ok:true,service:'school-drive-media'});
  if (action !== 'files') return json_({ok:false,error:'Unsupported action'});
  const folder = DriveApp.getFolderById(driveFolderId_()), files = [], it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) files.push({id:f.getId(),name:f.getName(),mimeType:f.getMimeType(),
      url:imageUrl_(f.getId()),updatedAt:f.getLastUpdated().toISOString()});
  }
  return json_({ok:true,files:files});
}
function doPost(e) {
  const p = e && e.parameter || {};
  try {
    if (p.action === 'upload') return uploadImage_(p);
    if (p.action === 'notify') return notify_(p);
    return json_({ok:false,error:'Unsupported action'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}
function uploadImage_(p) {
  const category = String(p.module || '');
  if (['news','personnel','galleries','settings'].indexOf(category) < 0) throw new Error('Invalid media category');
  const user = authorizeUpload_(p.access_token, category);
  const mime = String(p.mimeType || '').toLowerCase();
  if (IMAGE_TYPES.indexOf(mime) < 0) throw new Error('รองรับเฉพาะ JPG, PNG, WEBP และ GIF');
  const encoded = String(p.base64 || '');
  if (!encoded) throw new Error('ไม่พบข้อมูลภาพ');
  const bytes = Utilities.base64Decode(encoded);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('ขนาดภาพต้องไม่เกิน 6 MB');
  const original = String(p.filename || 'image').replace(/[\\/:*?"<>|#%{}^~\[\]]/g,'_').slice(0,100);
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const filename = Utilities.formatDate(new Date(),'Asia/Bangkok','yyyyMMdd_HHmmss') + '_' +
    Utilities.getUuid().slice(0,8) + '_' + original.replace(/\.[^.]+$/,'') + '.' + ext;
  const root = DriveApp.getFolderById(driveFolderId_());
  const folder = getOrCreateFolder_(root,category);
  const file = folder.createFile(Utilities.newBlob(bytes,mime,filename));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return json_({ok:true,id:file.getId(),name:file.getName(),url:imageUrl_(file.getId()),
    module:category,uploadedBy:user.email || user.id});
}
function authorizeUpload_(token,category) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('SUPABASE_PUBLISHABLE_KEY');
  if (!key) throw new Error('ผู้ดูแลระบบยังไม่ได้ตั้งค่า SUPABASE_PUBLISHABLE_KEY ใน Apps Script');
  const headers = {apikey:key,Authorization:'Bearer '+token};
  const auth = UrlFetchApp.fetch(SUPABASE_URL+'/auth/v1/user',{headers:headers,muteHttpExceptions:true});
  if (auth.getResponseCode() !== 200) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const user = JSON.parse(auth.getContentText());
  const check = UrlFetchApp.fetch(SUPABASE_URL+'/rest/v1/rpc/can_upload_media',{
    method:'post',contentType:'application/json',headers:headers,
    payload:JSON.stringify({p_module:category}),muteHttpExceptions:true
  });
  if (check.getResponseCode() !== 200 || check.getContentText() !== 'true') {
    throw new Error('บัญชีนี้ไม่มีสิทธิ์อัปโหลดภาพในหมวด '+category);
  }
  return user;
}
function getOrCreateFolder_(parent,name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function driveFolderId_() {
  return PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || DEFAULT_DRIVE_FOLDER_ID;
}
function imageUrl_(id) {
  return 'https://drive.google.com/thumbnail?id='+id+'&sz=w1600';
}
function notify_(p) {
  if (String(p.website || '').trim()) return json_({ok:true});
  const name=safe_(p.name,120), email=safe_(p.email,254), subject=safe_(p.subject,200), body=safe_(p.message,3500);
  if (name.length<2 || body.length<5) throw new Error('Invalid contact form data');
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,(email||name).toLowerCase(),Utilities.Charset.UTF_8);
  const cache=CacheService.getScriptCache(), key='contact_'+Utilities.base64EncodeWebSafe(digest).slice(0,32);
  if (cache.get(key)) throw new Error('Please wait before sending another message');
  cache.put(key,'1',60);
  sendTelegram_(['📩 ข้อความติดต่อจากเว็บไซต์โรงเรียน','ชื่อ: '+name,'อีเมล: '+(email||'-'),
    'หัวข้อ: '+(subject||'-'),'ข้อความ: '+body].join('\n'));
  return json_({ok:true});
}
function sendTelegram_(message) {
  const props=PropertiesService.getScriptProperties(), token=props.getProperty('TELEGRAM_BOT_TOKEN'), chatId=props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) throw new Error('Telegram secrets are not configured');
  const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true}),muteHttpExceptions:true
  });
  if (r.getResponseCode()>=300) throw new Error('Telegram API returned HTTP '+r.getResponseCode());
}
function safe_(v,n) { return String(v||'').replace(/[<>]/g,'').trim().slice(0,n); }
function json_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
