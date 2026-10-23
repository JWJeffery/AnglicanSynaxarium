import { dateLabelFor, seasonOf, stepKey } from '../lib/church-year';
import { localToday, readIndex } from './common';

export function initEntry() {
  const main = document.querySelector<HTMLElement>('[data-entry]');
  if (!main) return;
  const key = main.dataset.key!;
  const [m, d] = key.split('-').map(Number);
  const t = localToday();
  main.dataset.season = seasonOf(t.year, m, d);
  const label = main.querySelector('[data-date-label]');
  if (label) label.textContent = dateLabelFor(t.year, m, d);
  if (key !== t.key) main.querySelectorAll<HTMLAnchorElement>('[data-today-link]').forEach((a) => (a.hidden = false));

  // Text size, remembered between visits where the browser allows it.
  let size = 'normal';
  try { size = localStorage.getItem('syn-size') === 'large' ? 'large' : 'normal'; } catch { /* storage unavailable */ }
  const apply = (s: string) => {
    main.querySelectorAll<HTMLElement>('[data-prose], [data-collect]').forEach((el) => (el.dataset.size = s));
    main.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === s)));
  };
  apply(size);
  main.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) =>
    b.addEventListener('click', () => { size = b.dataset.size!; apply(size); try { localStorage.setItem('syn-size', size); } catch { /* ignore */ } }));
  readIndex(); // keeps the index parsed for future use; stepping uses real links already
  void stepKey;
}
