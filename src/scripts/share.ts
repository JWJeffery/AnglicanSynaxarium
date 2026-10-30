import qrcode from 'qrcode-generator';

// One shared "Share" dialog for the whole site. Any element with data-share opens it:
//   data-share-url    the full address to share (required)
//   data-share-title  what is being shared, e.g. a saint's name
//   data-share-text   one line of description
//   data-share-hero   (home page) share the saint now shown in the hero rather than the fixed address
// The dialog offers the device's own share sheet where there is one, Copy link, Email, and a QR code
// for sharing in person. Everything is made in the browser, so it also works offline.

interface Target { url: string; title: string; text: string; }

let dlg: HTMLDialogElement | null = null;

function targetFor(el: HTMLElement): Target {
  let url = el.dataset.shareUrl || location.href;
  let title = el.dataset.shareTitle || document.title;
  if (el.hasAttribute('data-share-hero')) {
    const hero = document.querySelector<HTMLElement>('[data-hero]');
    const name = hero?.querySelector<HTMLElement>('[data-slot="title"]')?.textContent?.trim();
    const live = hero?.dataset.mode === 'live';
    if (hero?.dataset.key && name && live) {
      url = new URL(`/saint/${hero.dataset.key}/`, url).toString();
      title = `${name} | An Anglican Synaxarium`;
    }
  }
  return { url, title, text: el.dataset.shareText || 'One saint for every day of the year, read in the Anglican manner.' };
}

function button(label: string, cls = 'btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = label;
  return b;
}

function build(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.id = 'share-dialog';
  d.setAttribute('aria-labelledby', 'share-heading');

  const head = document.createElement('div');
  head.className = 'share-head';
  const h = document.createElement('h2');
  h.id = 'share-heading'; h.textContent = 'Share';
  const close = button('Close', 'share-close');
  close.setAttribute('data-share-close', '');
  head.append(h, close);

  const what = document.createElement('p');
  what.className = 'share-what'; what.setAttribute('data-share-what', '');

  const field = document.createElement('div');
  field.className = 'share-field';
  const input = document.createElement('input');
  input.type = 'text'; input.readOnly = true; input.setAttribute('aria-label', 'Link'); input.setAttribute('data-share-link', '');
  const copy = button('Copy link', 'btn btn-primary');
  copy.setAttribute('data-share-copy', '');
  field.append(input, copy);

  const row = document.createElement('div');
  row.className = 'share-row';
  const native = button('Share…');
  native.setAttribute('data-share-native', ''); native.hidden = !('share' in navigator);
  const mail = document.createElement('a');
  mail.className = 'btn'; mail.textContent = 'Email'; mail.setAttribute('data-share-mail', '');
  row.append(native, mail);

  const status = document.createElement('p');
  status.className = 'share-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.setAttribute('data-share-status', '');

  const qr = document.createElement('div');
  qr.className = 'share-qr';
  const code = document.createElement('div');
  code.className = 'share-qr-code'; code.setAttribute('role', 'img'); code.setAttribute('data-share-qr', '');
  const cap = document.createElement('p');
  cap.textContent = 'Or point a phone camera at this code.';
  qr.append(code, cap);

  d.append(head, what, field, row, status, qr);
  document.body.appendChild(d);

  close.addEventListener('click', () => d.close());
  // A click on the dimmed area outside the box closes it.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  return d;
}

function fill(d: HTMLDialogElement, t: Target) {
  const q = <T extends HTMLElement>(s: string) => d.querySelector<T>(s)!;
  q('[data-share-what]').textContent = t.title.replace(/ \| An Anglican Synaxarium$/, '');
  const input = q<HTMLInputElement>('[data-share-link]');
  input.value = t.url;
  const status = q('[data-share-status]');
  status.textContent = '';

  const qr = qrcode(0, 'M');
  qr.addData(t.url);
  qr.make();
  const box = q('[data-share-qr]');
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  box.setAttribute('aria-label', `QR code for ${t.url}`);

  q<HTMLAnchorElement>('[data-share-mail]').href =
    `mailto:?subject=${encodeURIComponent(t.title)}&body=${encodeURIComponent(`${t.text}\n\n${t.url}`)}`;

  // Replace the buttons' handlers on each opening so they always act on the current target.
  const copy = q<HTMLButtonElement>('[data-share-copy]');
  const copyNew = copy.cloneNode(true) as HTMLButtonElement;
  copy.replaceWith(copyNew);
  copyNew.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(t.url); ok = true; } catch { /* fall back below */ }
    if (!ok) {
      input.focus(); input.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    status.textContent = ok ? 'Link copied.' : 'Select the link above and copy it.';
  });

  const nat = q<HTMLButtonElement>('[data-share-native]');
  const natNew = nat.cloneNode(true) as HTMLButtonElement;
  nat.replaceWith(natNew);
  natNew.addEventListener('click', async () => {
    try { await navigator.share({ title: t.title, text: t.text, url: t.url }); }
    catch { /* cancelled, or not allowed: the other options stay open */ }
  });
}

export function initShare() {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-share]');
    if (!el) return;
    e.preventDefault();
    if (!dlg) dlg = build();
    fill(dlg, targetFor(el));
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
}
