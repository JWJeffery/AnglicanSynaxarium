import fs from 'node:fs';
import path from 'node:path';
import calendarJson from '../../data/calendar.json';
import rankJson from '../../data/rank.json';
import receptionJson from '../../data/reception.json';
import cfg from '../../site.config.json';
import { stepKey } from './church-year';

export interface Day {
  key: string; month: number; day: number;
  name: string; designation: string; period: string;
  alternates: { name: string; designation: string; period: string }[];
}
export interface Entry { key: string; title: string; opening: string; body: string[]; collect: string[]; }

export const days: Day[] = (calendarJson as { days: Day[] }).days;
export const dayByKey = new Map(days.map((d) => [d.key, d]));
export const site = cfg;

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
  const paras = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return {
    key: JSON.parse(fm.key),
    title: JSON.parse(fm.title),
    opening: fm.opening,
    body: paras(bodyText),
    collect: paras(collectText),
  };
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

export const hasPodcast = Object.values(cfg.podcast).some(Boolean);
