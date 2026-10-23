import { MONTHS } from '../lib/church-year';
import { localToday, readIndex } from './common';

export function initPrintSection() {
  const root = document.querySelector<HTMLElement>('[data-print-section]');
  if (!root) return;
  const { map } = readIndex();
  const t = localToday();
  const row = map.get(t.key);
  const state: Record<string, boolean | string> = { sheet: 'day', collect: true, others: false, large: false, notes: true };

  const sun = new Date(t.year, t.month - 1, t.day - new Date(t.year, t.month - 1, t.day).getDay());
  const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekText = sun.getMonth() === sat.getMonth()
    ? `${MONTHS[sun.getMonth()]} ${sun.getDate()} to ${sat.getDate()}, ${sat.getFullYear()}`
    : `${MONTHS[sun.getMonth()]} ${sun.getDate()} to ${MONTHS[sat.getMonth()]} ${sat.getDate()}, ${sat.getFullYear()}`;

  const go = root.querySelector<HTMLAnchorElement>('[data-print-go]')!;
  const when = root.querySelector('[data-print-when]')!;
  const flag = (k: string) => (state[k] ? '1' : '0');

  const refresh = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sheet === state.sheet)));
    root.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => b.setAttribute('aria-pressed', String(!!state[b.dataset.opt!])));
    const opts = `collect=${flag('collect')}&others=${flag('others')}&large=${flag('large')}&notes=${flag('notes')}&print=1`;
    if (state.sheet === 'day') {
      go.href = `/print/day/?d=${t.key}&${opts}`;
      go.textContent = 'Print the Saint of the Day';
      when.textContent = `${MONTHS[t.month - 1]} ${t.day}`;
    } else {
      go.href = `/print/week/?start=${iso(sun)}&${opts}`;
      go.textContent = 'Print the week';
      when.textContent = weekText;
    }
  };
  root.querySelectorAll<HTMLButtonElement>('[data-sheet]').forEach((b) => b.addEventListener('click', () => { state.sheet = b.dataset.sheet!; refresh(); }));
  root.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => b.addEventListener('click', () => { state[b.dataset.opt!] = !state[b.dataset.opt!]; refresh(); }));

  // Thumbnails follow the visitor's day.
  if (row) {
    const set = (sel: string, v: string) => { const el = root.querySelector(sel); if (el) el.textContent = v; };
    set('[data-thumb-date]', `${MONTHS[t.month - 1]} ${t.day}`);
    set('[data-thumb-num]', String(t.day));
    set('[data-thumb-name]', row.t);
  }
  refresh();
}
