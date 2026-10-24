// Fails the build if any scholarly apparatus or dead link reaches the built site.
import fs from 'node:fs';
import path from 'node:path';

const bad = [/UO-SIN/i, /source_witnesses/i, /source_tier/i, /review_flags/i, /harmoniz/i, /\bSIN\b/, /href="#"/];
let failures = 0, files = 0;
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(html|json|xml|js|css|txt)$/.test(f.name)) {
      files++;
      const text = fs.readFileSync(p, 'utf-8');
      for (const re of bad) if (re.test(text)) { console.error(`FOUND ${re} in ${p}`); failures++; }
    }
  }
}
walk('dist');
const pages = fs.readdirSync('dist/saint').length;
console.log(`checked ${files} files, ${pages} saint pages`);
if (pages !== 366) { console.error(`expected 366 saint pages, found ${pages}`); failures++; }
if (failures) process.exit(1);

// Guard: working labels and review flags from the calendar data must never reach the public pages.
import fs2 from 'node:fs';
const cal = JSON.parse(fs2.readFileSync('data/calendar.json', 'utf-8')).days;
const leaks = [];
for (const d of cal) {
  for (const f of ['name', 'designation']) {
    const v = d[f] || '';
    if (/[:?]/.test(v) || (f === 'name' && v.includes(' / ')) || /\b(current|older|form|review|pending|alternate)\b/i.test(v) || v.length > 80) leaks.push(`${d.key} ${f}: ${v}`);
  }
}
if (leaks.length) { console.error('Note-like text in the calendar data:\n  ' + leaks.join('\n  ')); process.exit(1); }
console.log('calendar names and designations: no working notes');
