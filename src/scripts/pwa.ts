// Registers the service worker (public offline copy of the site) and offers updates.
// A new release downloads in the background and waits, so a page never mixes old and new files.
// When it is ready, a small notice offers to switch now; "Later" leaves it for the next visit.
// Does nothing while developing, where there is no sw.js.
export function initPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;

  let shown = false, reloading = false;

  function prompt(worker: ServiceWorker) {
    if (shown) return;
    shown = true;
    const box = document.createElement('div');
    box.id = 'update-prompt';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const text = document.createElement('span');
    const title = document.createElement('em');
    title.textContent = 'An Anglican Synaxarium';
    text.append('A new version of ', title, ' is ready.');
    const now = document.createElement('button');
    now.type = 'button'; now.className = 'primary'; now.textContent = 'Update now';
    const later = document.createElement('button');
    later.type = 'button'; later.textContent = 'Later';
    box.append(text, now, later);
    document.body.appendChild(box);
    now.addEventListener('click', () => { now.disabled = true; now.textContent = 'Updating…'; worker.postMessage({ type: 'SKIP_WAITING' }); });
    later.addEventListener('click', () => box.remove());
  }

  function watch(reg: ServiceWorkerRegistration) {
    // A worker that finishes installing while an older one still controls the page is an update.
    const ready = (w: ServiceWorker) => { if (navigator.serviceWorker.controller) prompt(w); };
    if (reg.waiting) ready(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') ready(w); });
    });
  }

  // When the new worker takes over, reload once so the page runs the new files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !shown) return; // the first install also fires this; reload only after an accepted update
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      watch(reg);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => { /* no sw.js (development) */ });
  });
}
