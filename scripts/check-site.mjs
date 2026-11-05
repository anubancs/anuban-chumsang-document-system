import fs from 'node:fs';
import path from 'node:path';

const ignored = /^(?:https?:|mailto:|tel:|javascript:|data:|blob:|\/\/)/i;
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.html')) htmlFiles.push(full);
  }
}
walk('.');
let failed = false;
let checked = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<(?:a|link|script|img|source)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1].trim();
    if (!raw || ignored.test(raw) || raw.startsWith('#') || raw.includes('${')) continue;
    const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
    if (!clean) continue;
    let target;
    if (clean.startsWith('/')) target = path.join('.', clean.replace(/^\/+/, ''));
    else target = path.resolve(path.dirname(file), clean);
    if (clean.endsWith('/')) target = path.join(target, 'index.html');
    checked++;
    if (!fs.existsSync(target)) {
      failed = true;
      console.error(`Missing local asset/link: ${file} -> ${raw} (resolved ${target})`);
    }
  }
}
const required = [
  'index.html', 'news.html', 'news-detail.html', 'personnel.html',
  'teacher-profile.html', 'downloads.html', 'gallery.html', 'contact.html',
  'classes.html', 'admin/login.html', 'admin/dashboard.html',
  'admin/library.html', 'admin/messages.html', 'assets/js/supabase.js', 'assets/js/api.js',
  'assets/css/style.css', 'gas/Code.gs', 'supabase/schema.sql'
];
for (const file of required) {
  if (!fs.existsSync(file)) {
    failed = true;
    console.error(`Required project file missing: ${file}`);
  }
}
if (failed) process.exit(1);
console.log(`Site smoke check passed: ${htmlFiles.length} HTML pages, ${checked} local references, ${required.length} required files.`);
