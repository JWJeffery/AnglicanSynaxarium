import { dateLabelFor, seasonOf, RANK_LABEL } from '../lib/church-year';
import qrcode from 'qrcode-generator';
import { fetchDay, localToday, readIndex, uoLink, type DayPayload } from './common';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Opts { collect: boolean; others: boolean; large: boolean; notes: boolean; }

// Small QR code to pray this day's Office in The Universal Office.
function uoQr(year: number, month: number, day: number): string {
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const qr = qrcode(0, 'M');
  qr.addData(uoLink(year, key));
  qr.make();
  return `<div class="uo-qr"><div class="uo-qr-code" role="img" aria-label="QR code: pray this day's Office at theuniversaloffice.com">${qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true })}</div><p>Pray today’s Office with <em>The Universal Office</em><br>theuniversaloffice.com</p></div>`;
}

function daySheet(year: number, month: number, day: number, p: DayPayload, o: Opts, brk: boolean): string {
  const season = seasonOf(year, month, day);
  const body = p.entry
    ? p.entry.body.map((t, i) => `<p${i === 0 ? ' class="lede"' : ''}>${t}</p>`).join('')
    : '<p>This saint’s entry is coming soon.</p>';
  let collect = '';
  if (o.collect && p.entry && p.entry.collect.length) {
    collect = '<div class="collect-block"><p class="let">Let us pray</p>' +
      p.entry.collect.map((t) => {
        const m = t.match(/^([\s\S]*?)\s*(Amen\.)$/);
        return m ? `<p class="collect-p">${m[1]} <span class="amen">${m[2]}</span></p>` : `<p class="collect-p">${t}</p>`;
      }).join('') + '</div>';
  }
  const others = o.others && p.alternates.length
    ? `<div class="others-block"><h2>Other Saints Commemorated Today</h2><ul>${p.alternates.map((a) => `<li>${esc(a.name)}${a.designation || a.period ? ', ' + esc([a.designation, a.period].filter(Boolean).join(', ')) : ''}</li>`).join('')}</ul></div>`
    : '';
  const notes = o.notes ? `<div class="notes" aria-hidden="true">${'<i></i>'.repeat(6)}</div>` : '';
  return `<section class="sheet${o.large ? ' large' : ''}${brk ? ' break' : ''}" data-season="${season}">
    <div class="run"><span><em>An Anglican Synaxarium</em></span><span>${esc(dateLabelFor(year, month, day))}</span></div>
    <div class="head">
      <h1>${esc(p.title)}</h1>
      <div class="sub">${p.period ? `<span>${esc(p.period)}</span>` : ''}<span class="rank" data-rank="${p.rank}">${RANK_LABEL[p.rank]}</span></div>
      <div class="rule"></div>
    </div>
    <div class="body">${body}</div>${collect}${others}${notes}
    ${uoQr(year, month, day)}
    <p class="foot">Read beside the Book of Common Prayer: ☐ before the Office ☐ after the Office</p>
  </section>`;
}

export async function initSheet() {
  const stage = document.querySelector<HTMLElement>('[data-sheets]');
  if (!stage) return;
  const q = new URLSearchParams(location.search);
  const o: Opts = { collect: q.get('collect') !== '0', others: q.get('others') === '1', large: q.get('large') === '1', notes: q.get('notes') !== '0' };
  const t = localToday();
  const { map } = readIndex();
  let html = '';

  if (stage.dataset.kind === 'day') {
    const key = /^\d\d-\d\d$/.test(q.get('d') || '') ? q.get('d')! : t.key;
    const [m, d] = key.split('-').map(Number);
    const p = await fetchDay(key);
    if (!p) { stage.innerHTML = '<p>That day could not be loaded.</p>'; return; }
    html = daySheet(t.year, m, d, p, o, false);
  } else {
    const s = /^\d{4}-\d\d-\d\d$/.test(q.get('start') || '') ? q.get('start')! : null;
    const base = s ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(t.year, t.month - 1, t.day - new Date(t.year, t.month - 1, t.day).getDay());
    const dates = Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
    const keys = dates.map((dt) => `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
    const payloads = await Promise.all(keys.map(fetchDay));
    const first = dates[0], last = dates[6];
    const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const range = first.getMonth() === last.getMonth()
      ? `${MON[first.getMonth()]} ${first.getDate()} to ${last.getDate()}, ${last.getFullYear()}`
      : `${MON[first.getMonth()]} ${first.getDate()} to ${MON[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
    const rows = dates.map((dt, i) => {
      const row = map.get(keys[i]);
      const p = payloads[i];
      return `<tr><td class="day">${esc(dateLabelFor(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()))}</td><td>${esc(row ? row.t : '')}${p?.period ? `<span class="sub2">${esc(p.period)}</span>` : ''}</td><td><span class="tick"></span></td></tr>`;
    }).join('');
    const season = seasonOf(first.getFullYear(), first.getMonth() + 1, first.getDate());
    html = `<section class="sheet${o.large ? ' large' : ''}" data-season="${season}">
      <div class="run"><span><em>An Anglican Synaxarium</em></span><span>The week</span></div>
      <h1>The week at a glance</h1>
      <div class="sub"><span>${esc(range)}</span></div>
      <div class="rule"></div>
      <table class="week-table"><thead><tr><th>Day</th><th>Saint</th><th>Read</th></tr></thead><tbody>${rows}</tbody></table>
      ${o.notes ? `<div class="notes" aria-hidden="true">${'<i></i>'.repeat(8)}</div>` : ''}
    </section>` +
      dates.map((dt, i) => payloads[i] ? daySheet(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), payloads[i]!, o, true) : '').join('');
  }

  stage.innerHTML = html;
  document.querySelector('[data-do-print]')?.addEventListener('click', () => window.print());
  if (q.get('print') === '1') setTimeout(() => window.print(), 400);
}
