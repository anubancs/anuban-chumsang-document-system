/**
 * Google Apps Script Web App for the school's public Drive folder and Telegram alerts.
 * Script Properties required:
 *   DRIVE_FOLDER_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Security: keep the Drive folder limited to files intended for public release.
 * The contact endpoint has validation, a honeypot and basic per-sender throttling.
 * Apps Script Web Apps are public endpoints when deployed for anonymous access;
 * add a stronger challenge/rate-limit gateway before high-volume public launch.
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
    files.push({
      id: f.getId(), name: f.getName(), mimeType: f.getMimeType(),
      url: f.getUrl(), updatedAt: f.getLastUpdated().toISOString()
    });
  }
  return json_({ ok: true, files: files });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'notify') return json_({ ok: false, error: 'Unsupported action' });

  // Reject automated form submissions that fill the visually hidden field.
  if (String(p.website || '').trim()) return json_({ ok: true });

  const name = safe_(p.name, 120);
  const email = safe_(p.email, 254);
  const subject = safe_(p.subject, 200);
  const body = safe_(p.message, 3500);
  if (name.length < 2 || body.length < 5) {
    return json_({ ok: false, error: 'Invalid contact form data' });
  }

  // Basic per-sender throttling. This is not a substitute for a dedicated anti-abuse service.
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    (email || name).toLowerCase(),
    Utilities.Charset.UTF_8
  );
  const key = 'contact_' + Utilities.base64EncodeWebSafe(digest).slice(0, 32);
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return json_({ ok: false, error: 'Please wait before sending another message' });
  cache.put(key, '1', 60);

  const message = [
    '📩 ข้อความติดต่อจากเว็บไซต์โรงเรียน',
    'ชื่อ: ' + name,
    'อีเมล: ' + (email || '-'),
    'หัวข้อ: ' + (subject || '-'),
    'ข้อความ: ' + body
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
  if (response.getResponseCode() >= 300) {
    throw new Error('Telegram API returned HTTP ' + response.getResponseCode());
  }
}

function safe_(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
