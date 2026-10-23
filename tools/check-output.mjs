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
