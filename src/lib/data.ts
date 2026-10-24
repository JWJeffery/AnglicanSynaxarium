import linksFile from '../../data/podcast-links.json';
import fs from 'node:fs';
import path from 'node:path';
import calendarJson from '../../data/calendar.json';
import rankJson from '../../data/rank.json';
import receptionJson from '../../data/reception.json';
import cfg from '../../site.config.json';
import { stepKey } from './church-year';
import { episodeByKey, episodes, feedUrl, hasFeed } from './podcast';

export interface Day {
  key: string; month: number; day: number;
  name: string; designation: string; period: string;
  alternates: { name: string; designation: string; period: string }[];
}
export interface Entry { key: string; title: string; opening: string; body: string[]; collect: string[]; }

export const days: Day[] = (calendarJson as { days: Day[] }).days;
export const dayByKey = new Map(days.map((d) => [d.key, d]));
// The RSS button appears as soon as the first episode exists, unless a different address is set in site.config.json.
// Where the show is listed: data/podcast-links.json (blank entries are ignored; a link there wins over site.config.json).
const listed = Object.fromEntries(Object.entries(linksFile as Record<string, string>).filter(([, v]) => v));
const podcast = { ...cfg.podcast, ...listed } as Record<string, string>;
podcast.rss = podcast.rss || (hasFeed ? feedUrl : '');
export const site = { ...cfg, podcast };
export { episodeByKey, episodes, feedUrl, hasFeed };

export function rankOf(key: string): string {
  return (rankJson as { default: string; dates: Record<string, string> }).dates[key] ?? 'commemoration';
}
export const greaterChurch = new Set((receptionJson as { greater_church: { key: string }[] }).greater_church.map((x) => x.key));

function parseEntry(file: string): Entry {
  const raw = fs.readFileSync(file, 'utf-8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Bad entry file ${file}`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const [bodyText, collectText = ''] = m[2].split(/\n## Collect\n/);
  const key = JSON.parse(fm.key);
  const paras = (t: string) => t.split(/\n\s*\n/).map((p) => italicize(p.trim(), key)).filter(Boolean);
  return {
    key,
    title: JSON.parse(fm.title),
    opening: fm.opening,
    body: paras(bodyText),
    collect: paras(collectText),
  };
}

// Titles to show in italics (content/italics.txt). Applied only to text that is not already italic.
const italicRules: { key: string | null; phrase: string }[] = (() => {
  const f = path.resolve('content/italics.txt');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf-8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const m = l.match(/^(\d\d-\d\d)\s*\|\s*(.+)$/);
    return m ? { key: m[1], phrase: m[2] } : { key: null, phrase: l };
  });
})();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function italicize(text: string, key: string): string {
  const phrases = italicRules.filter((r) => r.key === null || r.key === key).map((r) => r.phrase).sort((a, b) => b.length - a.length);
  if (!phrases.length) return text;
  const re = new RegExp(`(?<![\\w*])(${phrases.map(escRe).join('|')})(?![\\w*])`, 'g');
  // Leave anything already inside *...* alone.
  return text.split(/(\*[^*]+\*)/).map((seg, i) => (i % 2 === 1 ? seg : seg.replace(re, '*$1*'))).join('');
}

const dir = path.resolve('content/entries');
export const entries = new Map<string, Entry>();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  const e = parseEntry(path.join(dir, f));
  entries.set(e.key, e);
}

// Escape, then turn *italic* into <em>. Entry words are otherwise untouched.
function curl(text: string): string {
  let out = text.replace(/(\w)'(\w)/g, '$1\u2019$2').replace(/(\w)'(\s|$|[.,;:!?)])/g, '$1\u2019$2');
  let open = true;
  out = out.replace(/"/g, () => { const q = open ? '\u201C' : '\u201D'; open = !open; return q; });
  return out;
}

export function inline(text: string): string {
  const esc = curl(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function titleOf(d: Day): string {
  const e = entries.get(d.key);
  if (e) return e.title;
  const des = d.designation;
  const usable = des && !/Feast|Commemoration|\/|event/i.test(des) && /^[A-Z]/.test(des);
  return usable ? `${d.name}, ${des}` : d.name;
}

export function neighbors(key: string) {
  const prev = dayByKey.get(stepKey(key, -1))!, next = dayByKey.get(stepKey(key, 1))!;
  return { prev, next };
}

// What the browser needs for every day: names, ranks, alternates, whether an entry exists.
export function kalendarIndex() {
  return days.map((d) => ({
    k: d.key, n: d.name.split(' / ')[0], t: titleOf(d), p: d.period, r: rankOf(d.key),
    e: entries.has(d.key) ? 1 : 0,
    u: episodeByKey.get(d.key)?.published ?? '',
    a: d.alternates.map((a) => a.name),
  }));
}

export function dayPayload(key: string) {
  const d = dayByKey.get(key)!, e = entries.get(key);
  return {
    key, title: titleOf(d), period: d.period, rank: rankOf(key),
    alternates: d.alternates.map((a) => ({ name: a.name, designation: a.designation, period: a.period })),
    entry: e ? { body: e.body.map(inline), collect: e.collect.map(inline) } : null,
  };
}

export const hasPodcast = Object.values(podcast).some(Boolean);

// About page: written by the curator in content/about.md. No file or an empty file means no page and no link.
const aboutPath = path.resolve('content/about.md');
export const aboutSource = fs.existsSync(aboutPath) ? fs.readFileSync(aboutPath, 'utf-8').trim() : '';
export const hasAbout = aboutSource.length > 0;

function inlineMd(text: string): string {
  const esc = curl(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
export function aboutHtml(): string {
  return aboutSource.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (/^- /.test(b)) {
      return '<ul>' + b.split('\n').filter((l) => l.trim()).map((l) => `<li>${inlineMd(l.replace(/^- /, ''))}</li>`).join('') + '</ul>';
    }
    const h = b.match(/^(#{1,3})\s+(.+)$/);
    if (h) return `<h${h[1].length + 1}>${inlineMd(h[2])}</h${h[1].length + 1}>`;
    return `<p>${inlineMd(b.replace(/\n/g, ' '))}</p>`;
  }).join('\n');
}
export const elsewhere = [
  { name: 'Musings, Ancient and Modern', url: 'https://musingsancientandmodern.substack.com', italic: true },
  { name: 'The Universal Office', url: 'https://theuniversaloffice.com', italic: false },
];
