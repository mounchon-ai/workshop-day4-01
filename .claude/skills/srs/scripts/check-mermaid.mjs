// ตรวจไวยากรณ์ทุกบล็อก ```mermaid ในไฟล์ .md ที่ระบุ
// ใช้: node .claude/skills/srs/scripts/check-mermaid.mjs docs/sds
// ครั้งแรกจะติดตั้ง mermaid + jsdom ลงโฟลเดอร์ชั่วคราวของระบบ (ไม่แตะโปรเจกต์)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const cache = path.join(os.tmpdir(), 'srs-mermaid-check');
const entry = path.join(cache, 'node_modules', 'mermaid', 'dist', 'mermaid.core.mjs');

if (!fs.existsSync(entry)) {
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'package.json'), '{"name":"srs-mermaid-check","private":true}');
  console.error('กำลังติดตั้ง mermaid + jsdom ลง ' + cache + ' (ครั้งแรกเท่านั้น)…');
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', 'mermaid@11', 'jsdom'], {
    cwd: cache, stdio: 'inherit', shell: process.platform === 'win32',
  });
}

const { JSDOM } = await import(pathToFileURL(path.join(cache, 'node_modules', 'jsdom', 'lib', 'api.js')).href);
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

const mermaid = (await import(pathToFileURL(entry).href)).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('ระบุไฟล์ .md หรือโฟลเดอร์อย่างน้อยหนึ่งรายการ');
  process.exit(2);
}

const files = [];
for (const t of targets) {
  const st = fs.statSync(t);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(t)) if (f.endsWith('.md')) files.push(path.join(t, f));
  } else files.push(t);
}

let total = 0, failed = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const [i, m] of [...src.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].entries()) {
    total++;
    const line = src.slice(0, m.index).split('\n').length;
    const kind = m[1].trim().split('\n')[0].slice(0, 30);
    try {
      await mermaid.parse(m[1]);
    } catch (e) {
      failed++;
      console.log(`FAIL ${file}:${line}  บล็อกที่ ${i + 1} (${kind})`);
      console.log('     ' + String(e?.message ?? e).split('\n').slice(0, 5).join('\n     '));
    }
  }
}

console.log(`ตรวจ ${total} บล็อก จาก ${files.length} ไฟล์ — ${failed === 0 ? 'ผ่านทั้งหมด' : failed + ' บล็อกไม่ผ่าน'}`);
process.exit(failed === 0 ? 0 : 1);
