import fs from 'node:fs';
import path from 'node:path';

const roots = ['.'];
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.html')) htmlFiles.push(full);
  }
}
for (const root of roots) walk(root);
let failed = false;
for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  let inlineIndex = 0;
  for (const [, attrs, body] of scripts) {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    inlineIndex++;
    try {
      // Parse only; browser globals are intentionally not executed in CI.
      new Function(body);
    } catch (error) {
      failed = true;
      console.error(`Syntax error in ${file} inline script #${inlineIndex}: ${error.message}`);
    }
  }
}
if (failed) process.exit(1);
console.log(`Validated inline JavaScript in ${htmlFiles.length} HTML files.`);
