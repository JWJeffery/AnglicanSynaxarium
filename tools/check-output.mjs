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

// Podcast guard: when episodes exist, the feed, its scheduler and its settings must be complete.
const epFile = 'data/episodes.json';
const episodes = fs2.existsSync(epFile) ? JSON.parse(fs2.readFileSync(epFile, 'utf-8')).episodes : [];
const feedCfg = JSON.parse(fs2.readFileSync('site.config.json', 'utf-8')).feed;
const problems = [];
for (const f of ['feed-source.xml', 'feed.php', '.htaccess', 'podcast-cover.jpg']) {
  if (!fs2.existsSync(`dist/${f}`)) problems.push(`dist/${f} is missing`);
}
if (episodes.length) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(feedCfg.owner_email || '')) problems.push('feed.owner_email in site.config.json is empty or not an email address (Apple and Spotify require it)');
  if (!(feedCfg.owner_name || '').trim()) problems.push('feed.owner_name in site.config.json is empty');
  const xml = fs2.existsSync('dist/feed-source.xml') ? fs2.readFileSync('dist/feed-source.xml', 'utf-8') : '';
  const items = xml.split('<item>').slice(1);
  if (items.length !== episodes.length) problems.push(`feed has ${items.length} items but data/episodes.json lists ${episodes.length}`);
  const enclosures = items.map((i) => (i.match(/<enclosure url="([^"]+)"/) || [])[1]);
  const guids = items.map((i) => (i.match(/<guid[^>]*>([^<]+)</) || [])[1]);
  if (new Set(enclosures).size !== enclosures.length) problems.push('two episodes share one audio address');
  if (new Set(guids).size !== guids.length) problems.push('two episodes share one GUID');
  const keys = new Set();
  for (const e of episodes) {
    if (keys.has(e.key)) problems.push(`${e.key} is listed twice in data/episodes.json`);
    keys.add(e.key);
    if (!(e.bytes > 0) || !(e.seconds > 0) || Number.isNaN(Date.parse(e.published))) problems.push(`${e.key}: size, length or release time is missing`);
    const local = `audio/${e.file}`;
    if (fs2.existsSync(local) && fs2.statSync(local).size !== e.bytes) problems.push(`${local} on this machine is ${fs2.statSync(local).size} bytes but data/episodes.json says ${e.bytes}; run tools/add-episodes.py again for that day`);
    const page = `dist/saint/${e.key}/index.html`;
    if (!fs2.existsSync(page) || !fs2.readFileSync(page, 'utf-8').includes('data-hear')) problems.push(`${e.key}: the player is missing from its page`);
  }
  const missing = episodes.filter((e) => !fs2.existsSync(`audio/${e.file}`)).length;
  if (missing) console.log(`podcast: ${missing} of ${episodes.length} audio files are not on this machine (fine if they are already on the server)`);
}
if (problems.length) { console.error('Podcast check failed:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`podcast: ${episodes.length} episode(s) in the feed, scheduler and settings present`);

// Offline app guard: manifest, icons and a service worker that stores every page but never the audio or feed.
const app = [];
for (const f of ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) {
  if (!fs2.existsSync(`dist/${f}`)) app.push(`dist/${f} is missing`);
}
if (fs2.existsSync('dist/sw.js')) {
  const sw = fs2.readFileSync('dist/sw.js', 'utf-8');
  const pages = new Set([...sw.matchAll(/\{url:"(saint\/\d\d-\d\d\/index\.html)"/g)].map((m) => m[1]));
  if (pages.size !== 366) app.push(`the service worker stores ${pages.size} saint pages, expected 366`);
  for (const must of ['index.html', 'kalendar/index.html']) if (!sw.includes(`{url:"${must}"`)) app.push(`the service worker does not store ${must}`);
  for (const never of ['audio/', 'feed.xml', 'feed.php', 'feed-source.xml', 'podcast-cover.jpg', 'manifest.webmanifest']) if (sw.includes(`{url:"${never}`)) app.push(`the service worker must not store ${never}`);
}
const manifest = JSON.parse(fs2.readFileSync('dist/manifest.webmanifest', 'utf-8'));
for (const i of manifest.icons) if (!fs2.existsSync(`dist${i.src}`)) app.push(`manifest icon ${i.src} is missing`);
if (app.length) { console.error('Offline app check failed:\n  ' + app.join('\n  ')); process.exit(1); }
console.log('offline app: manifest, icons and service worker present; 366 saint pages stored');
