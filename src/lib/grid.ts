// Month grid markup. Used at build time (Astro) and in the browser, so both agree exactly.
import { MONTHS, WEEKDAYS, daysInMonth, keyOf, seasonOf, weekdayOf } from './church-year';

export interface IndexRow { k: string; n: string; t: string; p: string; r: string; e: number; a: string[]; }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function monthGridHtml(year: number, month: number, index: Map<string, IndexRow>, todayKey: string | null, selectedKey: string | null): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = daysInMonth(year, month);
  let html = WEEKDAYS.map((w) => `<div class="dow lab">${w.slice(0, 3)}</div>`).join('');
  for (let i = 0; i < first; i++) html += '<div class="cell-blank"></div>';
  for (let d = 1; d <= total; d++) {
    const key = keyOf(month, d);
    const row = index.get(key);
    const name = row ? row.n : '';
    const isToday = key === todayKey;
    const isSel = key === selectedKey;
    const label = `${weekdayOf(year, month, d)}, ${MONTHS[month - 1]} ${d}: ${name}${isToday ? ', today' : ''}`;
    html += `<a class="cell" href="/saint/${key}/" data-season="${seasonOf(year, month, d)}" aria-label="${esc(label)}"` +
      (isToday || isSel ? ' aria-current="true"' : '') + '>' +
      `<span class="cell-top"><span class="cell-num">${d}</span>${isToday ? '<span class="lab today-tag">Today</span>' : ''}</span>` +
      `<span class="cell-name">${esc(name)}</span></a>`;
  }
  const used = first + total;
  const tail = (7 - (used % 7)) % 7;
  for (let i = 0; i < tail; i++) html += '<div class="cell-blank"></div>';
  return html;
}
