// The Saints page: switch between date order and A to Z, and search as you type. The page is complete HTML without this
// script (the date list); this only adds the controls.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function initSaints() {
  const root = document.querySelector<HTMLElement>('[data-saints]');
  if (!root) return;
  const q = root.querySelector<HTMLInputElement>('[data-q]')!;
  const ready = root.querySelector<HTMLInputElement>('[data-ready]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const none = root.querySelector<HTMLElement>('[data-none]')!;
  const jump = root.querySelector<HTMLElement>('[data-az-jump]')!;
  const lists = new Map(Array.from(root.querySelectorAll<HTMLElement>('[data-list]')).map((el) => [el.dataset.list!, el]));
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-view-btn]'));
  root.querySelector<HTMLElement>('[data-tools]')!.hidden = false;
  root.querySelector<HTMLFormElement>('[data-search-form]')!.addEventListener('submit', (e) => e.preventDefault());

  let view = 'date';
  const params = new URLSearchParams(location.search);
  if (params.get('sort') === 'az' || location.hash === '#az') view = 'az';
  q.value = params.get('q') || '';
  ready.checked = params.get('ready') === '1';

  function apply() {
    const words = fold(q.value).split(/\s+/).filter(Boolean);
    const onlyReady = ready.checked;
    root!.dataset.view = view;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === view)));
    lists.forEach((el, name) => (el.hidden = name !== view));
    jump.hidden = view !== 'az' || words.length > 0 || onlyReady;
    let shown = 0;
    lists.get(view)!.querySelectorAll<HTMLElement>('[data-group]').forEach((group) => {
      let any = 0;
      group.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
        const hay = row.dataset.search || '';
        const ok = words.every((w) => hay.includes(w)) && (!onlyReady || row.dataset.written === '1');
        row.hidden = !ok;
        if (ok) any++;
      });
      group.hidden = any === 0;
      shown += any;
    });
    none.hidden = shown !== 0;
    count.textContent = words.length || onlyReady ? `${shown} ${shown === 1 ? 'saint' : 'saints'} found` : '';
    const next = new URLSearchParams();
    if (q.value.trim()) next.set('q', q.value.trim());
    if (view === 'az') next.set('sort', 'az');
    if (onlyReady) next.set('ready', '1');
    history.replaceState(null, '', location.pathname + (next.toString() ? '?' + next : ''));
  }
  buttons.forEach((b) => b.addEventListener('click', () => { view = b.dataset.viewBtn!; apply(); }));
  q.addEventListener('input', apply);
  ready.addEventListener('change', apply);
  apply();
}
