import { MONTHS, MONTH_SLUGS, RANK_LABEL, dateLabelFor, liturgicalDayName, seasonOf, stepKey } from '../lib/church-year';
import { monthGridHtml } from '../lib/grid';
import { fetchDay, localToday, readIndex } from './common';

export async function initHome() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;
  const { map } = readIndex();
  const t = localToday();
  const q = <T extends HTMLElement>(sel: string) => hero.querySelector<T>(sel);

  // Day stepper
  const prev = map.get(stepKey(t.key, -1))!, next = map.get(stepKey(t.key, 1))!;
  const a = q<HTMLAnchorElement>('[data-prev]')!, b = q<HTMLAnchorElement>('[data-next]')!;
  a.href = `/saint/${prev.k}/`; q('[data-prev-name]')!.textContent = prev.n;
  b.href = `/saint/${next.k}/`; q('[data-next-name]')!.textContent = next.n;
  q('[data-date-label]')!.textContent = dateLabelFor(t.year, t.month, t.day);
  q('[data-day-name]')!.textContent = liturgicalDayName(t.year, t.month, t.day);
  hero.dataset.season = seasonOf(t.year, t.month, t.day);

  // Calendar for the visitor's month
  const kal = document.querySelector<HTMLElement>('[data-kal]');
  if (kal) renderKal(kal, t.year, t.month, t.key, map);

  if (hero.dataset.key === t.key) return; // the static page already shows today's saint
  const row = map.get(t.key)!;
  const day = await fetchDay(t.key);
  hero.dataset.key = t.key;
  const rank = row.r;
  const rk = q('[data-slot="rank"]')!; rk.dataset.rank = rank; rk.textContent = RANK_LABEL[rank];
  q('[data-slot="title"]')!.textContent = row.t;
  const period = q('[data-slot="period"]')!; period.textContent = row.p; period.hidden = !row.p;
  const has = !!day?.entry;
  const lede = q('[data-slot="lede"]')!, first = q('[data-slot="first"]')!;
  lede.innerHTML = has ? day!.entry!.body[0] : ''; lede.hidden = !has;
  first.innerHTML = has ? (day!.entry!.body[1] ?? '') : ''; first.hidden = !has;
  q('[data-slot="prep"]')!.hidden = has;
  q('[data-slot="actions"]')!.hidden = !has;
  q<HTMLAnchorElement>('[data-slot="read"]')!.href = `/saint/${t.key}/`;
  const others = q('[data-slot="others"]')!, list = q('[data-slot="others-list"]')!;
  list.innerHTML = '';
  for (const n of row.a) { const li = document.createElement('li'); li.textContent = n; list.appendChild(li); }
  others.hidden = row.a.length === 0;
}

export function renderKal(kal: HTMLElement, year: number, month: number, todayKey: string, map: ReturnType<typeof readIndex>['map']) {
  const todayHere = Number(todayKey.slice(0, 2)) === month ? todayKey : null;
  kal.querySelector('[data-kal-grid]')!.innerHTML = monthGridHtml(year, month, map, todayHere, todayHere);
  kal.querySelector('[data-kal-title]')!.textContent = `${MONTHS[month - 1]} ${year}`;
  const p = month === 1 ? 12 : month - 1, n = month === 12 ? 1 : month + 1;
  const pa = kal.querySelector<HTMLAnchorElement>('[data-kal-prev]')!, na = kal.querySelector<HTMLAnchorElement>('[data-kal-next]')!;
  pa.href = `/kalendar/${MONTH_SLUGS[p - 1]}/`; pa.textContent = `‹ ${MONTHS[p - 1]}`; pa.setAttribute('aria-label', `Previous month, ${MONTHS[p - 1]}`);
  na.href = `/kalendar/${MONTH_SLUGS[n - 1]}/`; na.textContent = `${MONTHS[n - 1]} ›`; na.setAttribute('aria-label', `Next month, ${MONTHS[n - 1]}`);
}
