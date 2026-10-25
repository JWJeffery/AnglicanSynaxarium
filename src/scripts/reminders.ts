// The Daily Reminder page: a notification at a chosen time (15-minute steps) and on chosen days, to read the day's
// saint. The notification is a Web Push message sent by the server at that time in the visitor's own time zone (the
// service is run by The Universal Office, api/src/Handlers/Push.php there), so it arrives even when the site is
// closed. This keeps one entry in localStorage (the device's manage token and the chosen time) and nothing else.
// Text goes in with textContent only. Every storage read and write is wrapped; nothing throws into the page.
const STORE = 'synReminder.v1';
const KIND = 'daily';
const RESYNC_MS = 24 * 60 * 60 * 1000;

interface State { token: string; endpoint: string; tz: string; syncedAt: number; time: string; days: number[]; }

const load = (): State | null => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } };
const store = (s: State | null) => { try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch { /* ignore */ } };
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

function b64uToBytes(s: string): Uint8Array {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function initReminders() {
  const root = document.querySelector<HTMLElement>('[data-reminders]');
  if (!root) return;
  const api = (root.dataset.api || '').replace(/\/$/, '');
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const timeSel = q<HTMLSelectElement>('[data-time]');
  const dayBtns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-day]'));
  const onBtn = q<HTMLButtonElement>('[data-on]'), offBtn = q<HTMLButtonElement>('[data-off]'), testBtn = q<HTMLButtonElement>('[data-test]');
  const status = q<HTMLElement>('[data-status]'), unsupported = q<HTMLElement>('[data-unsupported]'), form = q<HTMLElement>('[data-form]');

  let state = load();
  let busy = false;
  let saveTimer: number | undefined;

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const installed = () => { try { if (matchMedia('(display-mode: standalone)').matches) return true; } catch { /* ignore */ } return (navigator as any).standalone === true; };
  const unsupportedReason = (): string | null => {
    if (!api) return 'Reminders are not switched on yet.';
    if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return 'Reminders need the secure (https) site.';
    if (isIOS && !installed()) return 'On iPhone and iPad, reminders work once this site is on your Home Screen. Tap the Share button, choose “Add to Home Screen”, then open it from there and return to this page.';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'This browser cannot show reminders. Chrome, Edge, Firefox and Safari (as a Home Screen app on iPhone) can.';
    return null;
  };

  const days = (): number[] => dayBtns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.dataset.day));
  const say = (text: string, bad = false) => { status.textContent = text; status.hidden = !text; status.classList.toggle('notice-bad', bad); };
  const draw = () => {
    const on = !!state;
    onBtn.hidden = on; offBtn.hidden = !on; testBtn.hidden = !on;
  };
  const explain = (m?: string) =>
    m === 'off' ? 'Reminders are not switched on at the server yet.' :
    m === 'busy' ? 'Too many changes just now. Please try again in a little while.' :
    m === 'worker' ? 'The site is still getting ready for offline use. Reload the page and try again.' :
    'Could not reach the server. Check your connection and try again.';

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const r = await fetch(api + path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  const ready = (): Promise<ServiceWorkerRegistration> => Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('worker')), 8000)),
  ]);
  async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
    const k = await call('GET', '/push/key');
    if (k.status !== 200 || !k.body.publicKey) throw new Error(k.status === 503 ? 'off' : 'net');
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(k.body.publicKey) as BufferSource });
  }
  async function push(reg: ServiceWorkerRegistration, sub: PushSubscription, time: string, chosen: number[], retried = false): Promise<void> {
    const payload: any = { app: 'synaxarium', subscription: sub.toJSON(), tz: tz(), reminders: [{ kind: KIND, time, days: chosen }] };
    if (state && state.endpoint === sub.endpoint && state.token) payload.token = state.token;
    const r = await call('PUT', '/push/subscription', payload);
    if (r.status === 403 && !retried) {
      // The server knows this browser address but this page lost its token: start again with a fresh address.
      await sub.unsubscribe();
      return push(reg, await subscribe(reg), time, chosen, true);
    }
    if (r.status !== 200) throw new Error(r.status === 503 ? 'off' : r.status === 429 ? 'busy' : 'net');
    state = { token: r.body.token || (state && state.endpoint === sub.endpoint ? state.token : ''), endpoint: sub.endpoint, tz: tz(), syncedAt: Date.now(), time, days: chosen };
    store(state);
  }

  async function turnOn() {
    if (busy) return;
    if (days().length === 0) { say('Choose at least one day.', true); return; }
    busy = true; say('');
    try {
      // Ask for permission first, straight from the tap: some browsers refuse to ask later. (It answers at once
      // when the person has already decided.)
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed');
      const reg = await ready();
      const sub = (await reg.pushManager.getSubscription()) || (await subscribe(reg));
      await push(reg, sub, timeSel.value, days());
      say('Reminder is on. You can send yourself a test.');
    } catch (e) {
      const m = (e as Error).message;
      say(m === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.'
        : m === 'dismissed' ? 'Reminders need your permission to show notifications.' : explain(m), true);
    }
    busy = false; draw();
  }

  function scheduleSave() {
    if (!state) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async function run() {
      if (busy) { saveTimer = window.setTimeout(run, 400); return; }
      if (days().length === 0) { say('Choose at least one day.', true); return; }
      busy = true;
      try {
        const reg = await ready();
        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error('net');
        await push(reg, sub, timeSel.value, days());
        say('Saved.');
      } catch (e) { say(explain((e as Error).message), true); }
      busy = false; draw();
    }, 600);
  }

  async function turnOff() {
    if (busy || !state) return;
    busy = true;
    const s = state;
    await Promise.all([
      call('POST', '/push/unsubscribe', { endpoint: s.endpoint, token: s.token }).catch(() => null),
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => sub && sub.unsubscribe()).catch(() => null),
    ]);
    state = null; store(null); busy = false; say('Reminder is off.'); draw();
  }

  async function sendTest() {
    if (busy || !state) return;
    busy = true; say('Sending…');
    try {
      const r = await call('POST', '/push/test', { endpoint: state.endpoint, token: state.token });
      if (r.status === 200) say('Sent. A notification should appear in a moment.');
      else if (r.status === 410 || r.status === 404) { state = null; store(null); say('This device was no longer signed up. Turn the reminder on again.', true); }
      else if (r.status === 429) say('Too many tests. Please try again later.', true);
      else say('The notification could not be sent. Try again in a moment.', true);
    } catch { say(explain(), true); }
    busy = false; draw();
  }

  // Quietly keep the server's copy fresh: a new time zone (travel), a replaced browser address, or about once a day.
  async function resync() {
    if (!state || unsupportedReason() || Notification.permission !== 'granted') return;
    try {
      const reg = await ready();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { await push(reg, await subscribe(reg), state.time, state.days); }
      else if (sub.endpoint !== state.endpoint || state.tz !== tz() || Date.now() - state.syncedAt > RESYNC_MS) { await push(reg, sub, state.time, state.days); }
    } catch { /* offline or not ready: try again next visit */ }
  }

  const why = unsupportedReason();
  if (why) { unsupported.textContent = why; unsupported.hidden = false; form.hidden = true; return; }
  if (state) {
    timeSel.value = state.time;
    dayBtns.forEach((b) => b.setAttribute('aria-pressed', String(state!.days.includes(Number(b.dataset.day)))));
  }
  timeSel.addEventListener('change', scheduleSave);
  dayBtns.forEach((b) => b.addEventListener('click', () => {
    const next = b.getAttribute('aria-pressed') !== 'true';
    if (!next && days().length === 1) return;
    b.setAttribute('aria-pressed', String(next));
    scheduleSave();
  }));
  onBtn.addEventListener('click', turnOn);
  offBtn.addEventListener('click', turnOff);
  testBtn.addEventListener('click', sendTest);
  draw();
  resync();
}
