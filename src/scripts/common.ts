import type { IndexRow } from '../lib/grid';
import { keyOf } from '../lib/church-year';

export function readIndex(): { list: IndexRow[]; map: Map<string, IndexRow> } {
  const el = document.getElementById('kal-index');
  const list: IndexRow[] = el ? JSON.parse(el.textContent || '[]') : [];
  return { list, map: new Map(list.map((r) => [r.k, r])) };
}

export function localToday() {
  const n = new Date();
  const year = n.getFullYear(), month = n.getMonth() + 1, day = n.getDate();
  return { year, month, day, key: keyOf(month, day) };
}

export interface DayPayload {
  key: string; title: string; period: string; rank: string;
  alternates: { name: string; designation: string; period: string }[];
  entry: { body: string[]; collect: string[] } | null;
}

export async function fetchDay(key: string): Promise<DayPayload | null> {
  try {
    const r = await fetch(`/data/day/${key}.json`);
    return r.ok ? ((await r.json()) as DayPayload) : null;
  } catch { return null; }
}
