/**
 * Google Apps Script Web App.
 * Script Properties required:
 * DRIVE_FOLDER_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * Deploy > Web app > Execute as Me. Restrict access where possible.
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'files';
  if (action !== 'files') return json_({ ok: false, error: 'Unsupported action' });
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!folderId) return json_({ ok: false, error: 'Drive folder is not configured' });
  const folder = DriveApp.getFolderById(folderId);
  const files = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const f = iterator.next();
    if (f.isTrashed()) continue;
    files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), url: f.getUrl(), updatedAt: f.getLastUpdated().toISOString() });
  }
  return json_({ ok: true, files: files });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'notify') return json_({ ok: false, error: 'Unsupported action' });
  const message = [
    '📩 ข้อความติดต่อจากเว็บไซต์โรงเรียน',
    'ชื่อ: ' + safe_(p.name),
    'อีเมล: ' + safe_(p.email),
    'หัวข้อ: ' + safe_(p.subject),
    'ข้อความ: ' + safe_(p.message)
  ].join('\n');
  sendTelegram_(message);
  return json_({ ok: true });
}

function sendTelegram_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) throw new Error('Telegram secrets are not configured');
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error('Telegram API returned ' + response.getResponseCode());
}
function safe_(value) { return String(value || '').replace(/[<>]/g, '').slice(0, 4000); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }