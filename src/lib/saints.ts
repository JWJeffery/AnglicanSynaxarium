// The list of saints for /saints/: every commemoration in the Kalendar (and the extra saints some days also remember),
// in date order, with a name to file them under for the A to Z order.
import { days, entries, titleOf } from './data';
import { MONTHS } from './church-year';

export interface SaintRow {
  key: string;            // MM-DD, the day page the row links to
  name: string;           // as written in the Kalendar
  sub: string;            // designation and period, e.g. "Priest · 1986"
  month: number;
  day: number;
  also: boolean;          // a saint remembered on a day that has a different first name
  written: boolean;       // the day's entry has been written
  sortKey: string;        // for A to Z: "Saint Luke the Evangelist" files under L
  search: string;         // lower-case, accent-free text the search box looks through
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sortKeyOf = (name: string) => fold(name).replace(/^(the|saint|st\.?|saints|ss\.?)\s+/, '').replace(/^[^a-z0-9]+/, '');
const clean = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
const subOf = (designation: string, period: string) => {
  const usable = designation && !/Feast|Commemoration|event/i.test(designation) ? designation : '';
  return [usable, period].map(clean).filter(Boolean).join(' · ');
};

export function saintRows(): SaintRow[] {
  const rows: SaintRow[] = [];
  for (const d of days) {
    const written = entries.has(d.key);
    const push = (name: string, designation: string, period: string, also: boolean) => {
      const sub = subOf(designation, period);
      rows.push({
        key: d.key, name: clean(name), sub, month: d.month, day: d.day, also, written,
        sortKey: sortKeyOf(name),
        search: fold(`${name} ${designation} ${period} ${MONTHS[d.month - 1]} ${d.day}`),
      });
    };
    push(d.name, d.designation, d.period, false);
    for (const a of d.alternates) push(a.name, a.designation, a.period, true);
  }
  return rows;
}

export const byDate = (rows: SaintRow[]) => rows;   // days are already in calendar order
export const byName = (rows: SaintRow[]) =>
  [...rows].sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'en') || a.name.localeCompare(b.name, 'en'));
export const letterOf = (r: SaintRow) => (/^[a-z]/.test(r.sortKey) ? r.sortKey[0].toUpperCase() : '#');
