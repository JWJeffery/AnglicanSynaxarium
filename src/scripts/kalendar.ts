import { MONTHS, MONTH_SLUGS } from '../lib/church-year';
import { monthGridHtml } from '../lib/grid';
import { localToday, readIndex } from './common';

export function initKalendar() {
  const kal = document.querySelector<HTMLElement>('[data-kal]');
  if (!kal) return;
  const { map } = readIndex();
  const t = localToday();
  const isIndex = location.pathname.replace(/\/$/, '') === '/kalendar';
  const month = isIndex ? t.month : Number(kal.dataset.month);
  const todayHere = t.month === month ? t.key : null;
  kal.querySelector('[data-kal-grid]')!.innerHTML = monthGridHtml(t.year, month, map, todayHere, null);
  kal.querySelector('[data-kal-title]')!.textContent = `${MONTHS[month - 1]} ${t.year}`;
  if (isIndex) {
    const p = month === 1 ? 12 : month - 1, n = month === 12 ? 1 : month + 1;
    const pa = kal.querySelector<HTMLAnchorElement>('[data-kal-prev]')!, na = kal.querySelector<HTMLAnchorElement>('[data-kal-next]')!;
    pa.href = `/kalendar/${MONTH_SLUGS[p - 1]}/`; pa.textContent = `‹ ${MONTHS[p - 1]}`; pa.setAttribute('aria-label', `Previous month, ${MONTHS[p - 1]}`);
    na.href = `/kalendar/${MONTH_SLUGS[n - 1]}/`; na.textContent = `${MONTHS[n - 1]} ›`; na.setAttribute('aria-label', `Next month, ${MONTHS[n - 1]}`);
  }
}
