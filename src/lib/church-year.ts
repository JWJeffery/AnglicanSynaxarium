// Church-year seasons. Shared by the build and the browser.
// The table follows BUILD_SPEC section 4. It is the builder's reading of the church year
// and still needs the curator's confirmation against the 1979 Book of Common Prayer.

export type Season = 'advent' | 'festal' | 'lent' | 'holyweek' | 'pentecost' | 'ordinary';

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const MONTH_SLUGS = MONTHS.map((m) => m.toLowerCase());
export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DAY = 86400000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);

export function easter(year: number): number {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

// First Sunday of Advent: the Sunday nearest November 30.
export function adventStart(year: number): number {
  const nov30 = utc(year, 10, 30);
  const dow = new Date(nov30).getUTCDay();
  return dow <= 3 ? nov30 - dow * DAY : nov30 + (7 - dow) * DAY;
}

export function seasonOf(year: number, month: number, day: number): Season {
  const t = utc(year, month - 1, day);
  const e = easter(year);
  const ash = e - 46 * DAY, palm = e - 7 * DAY, pent = e + 49 * DAY;
  if (t >= adventStart(year)) return t <= utc(year, 11, 24) ? 'advent' : 'festal';
  if (month === 12 && day >= 25) return 'festal';
  if (month === 1 && day <= 5) return 'festal';
  if (month === 1 && day === 6) return 'festal';
  if (t < ash) return 'ordinary';
  if (t < palm) return 'lent';
  if (t < e) return 'holyweek';
  if (t < pent) return 'festal';
  if (t === pent) return 'pentecost';
  return 'ordinary';
}

export function seasonLabel(s: Season): string {
  return { advent: 'Advent', festal: 'Christmas', lent: 'Lent', holyweek: 'Holy Week', pentecost: 'Pentecost', ordinary: 'Ordinary Time' }[s];
}

// Label shown beside the date. The festal band is Christmas, the Epiphany, or Easter by date.
export function seasonName(year: number, month: number, day: number): string {
  const s = seasonOf(year, month, day);
  if (s !== 'festal') return seasonLabel(s);
  const t = utc(year, month - 1, day), e = easter(year);
  if (t >= e && t < e + 49 * DAY) return 'Easter';
  if (month === 1 && day === 6) return 'The Epiphany';
  return 'Christmas';
}

export function pad(n: number): string { return String(n).padStart(2, '0'); }
export function keyOf(month: number, day: number): string { return `${pad(month)}-${pad(day)}`; }

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The saint's date for a given civil date. February 29 exists in the data for every year;
// in a common year the 29th is simply never reached.
export function weekdayOf(year: number, month: number, day: number): string {
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function stepKey(key: string, delta: number): string {
  // Step through the 366-day calendar in leap-year order (Feb 29 included).
  const [m, d] = key.split('-').map(Number);
  const t = Date.UTC(2024, m - 1, d) + delta * DAY;
  const dt = new Date(t);
  return keyOf(dt.getUTCMonth() + 1, dt.getUTCDate());
}

export const RANK_LABEL: Record<string, string> = {
  principal: 'Principal Feast',
  lord: 'Feast of Our Lord',
  major: 'Major Feast',
  commemoration: 'Commemoration',
};

// "Wednesday, November 11". February 29 in a common year has no weekday, so it is shown without one.
export function dateLabelFor(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const valid = dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  return valid ? `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[month - 1]} ${day}` : `${MONTHS[month - 1]} ${day}`;
}
