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

// Season names as the 1979 Book of Common Prayer titles them (Calendar, pp. 30-33).
// The BCP never uses "Ordinary Time": it says Epiphany Season and The Season After Pentecost.
export function seasonLabel(s: Season): string {
  return { advent: 'Advent Season', festal: 'Christmas Season', lent: 'Lenten Season', holyweek: 'Holy Week', pentecost: 'The Day of Pentecost', ordinary: 'Season After Pentecost' }[s];
}

// Label shown beside the date.
export function seasonName(year: number, month: number, day: number): string {
  const s = seasonOf(year, month, day);
  const t = utc(year, month - 1, day), e = easter(year);
  if (s === 'festal') {
    if (t >= e && t < e + 49 * DAY) return 'Easter Season';
    if (month === 1 && day === 6) return 'The Epiphany';
    return 'Christmas Season';
  }
  if (s === 'ordinary') return t < e ? 'Epiphany Season' : 'The Season After Pentecost';
  return seasonLabel(s);
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

// ---------------------------------------------------------------------------
// The name of the day in the 1979 BCP's own terms: Sundays by their BCP names
// ("The Third Sunday of Advent", "Proper 24"), weekdays by the Sunday that opens their week.
// Propers follow the BCP rule: Proper N is the Sunday closest to May 11 + 7(N-1) days.
// ---------------------------------------------------------------------------
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

export function liturgicalDayName(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1) return '';
  const t = dt.getTime();
  const dow = dt.getUTCDay();
  const W = WEEKDAYS[dow];
  const sun = t - dow * DAY; // the Sunday that opens this week
  const e = easter(year), ash = e - 46 * DAY, palm = e - 7 * DAY, pent = e + 49 * DAY, trinity = pent + 7 * DAY;
  const adv = adventStart(year);
  const isSun = dow === 0;
  const wk = (name: string) => (isSun ? `The ${name}` : `${W} in the Week of the ${name}`);

  // Christmas Season
  if (month === 12 && day === 25) return 'Christmas Day';
  if ((month === 12 && day >= 26) || (month === 1 && day <= 5)) {
    if (month === 1 && day === 1) return 'The Holy Name of Our Lord';
    if (isSun) return (month === 12 ? 'The First Sunday after Christmas Day' : 'The Second Sunday after Christmas Day');
    return `${W} in the Christmas Season`;
  }
  if (month === 1 && day === 6) return 'The Epiphany';

  // Advent
  if (t >= adv && t < utc(year, 11, 25)) {
    if (!isSun && month === 12 && day === 24) return 'Christmas Eve';
    const n = Math.round((sun - adv) / (7 * DAY)) + 1;
    return wk(`${ORD[n]} Sunday of Advent`);
  }

  // Epiphany Season: from January 7 to the day before Ash Wednesday
  if (t < ash) {
    const jan6 = utc(year, 0, 6);
    const firstSun = jan6 + (7 - new Date(jan6).getUTCDay()) * DAY; // first Sunday after the Epiphany
    if (t < firstSun) return `${W} after the Epiphany`;
    const lastSun = ash - 3 * DAY;
    const n = Math.round((sun - firstSun) / (7 * DAY)) + 1;
    if (sun === firstSun) return wk('First Sunday after the Epiphany: The Baptism of Our Lord').replace(/: The Baptism of Our Lord$/, isSun ? ': The Baptism of Our Lord' : '');
    if (sun >= lastSun) return wk('Last Sunday after the Epiphany');
    return wk(`${ORD[n]} Sunday after the Epiphany`);
  }

  // Lent and Holy Week
  if (t === ash) return 'Ash Wednesday';
  if (t < palm) {
    if (t < ash + 4 * DAY) return `${W} after Ash Wednesday`;
    const n = Math.round((sun - (ash + 4 * DAY)) / (7 * DAY)) + 1;
    return wk(`${ORD[n]} Sunday in Lent`);
  }
  if (t === palm) return 'Palm Sunday';
  if (t < e) {
    if (t === e - 3 * DAY) return 'Maundy Thursday';
    if (t === e - 2 * DAY) return 'Good Friday';
    if (t === e - 1 * DAY) return 'Holy Saturday';
    return `${W} of Holy Week`;
  }

  // Easter Season
  if (t === e) return 'Easter Day';
  if (t < e + 7 * DAY) return `${W} in Easter Week`;
  if (t === e + 39 * DAY) return 'Ascension Day';
  if (t < pent) {
    const n = Math.round((sun - e) / (7 * DAY)) + 1;
    return wk(`${ORD[n]} Sunday of Easter`);
  }
  if (t === pent) return 'The Day of Pentecost';

  // The Season After Pentecost
  if (t < trinity) return `${W} in the Week of Pentecost`;
  if (t === trinity) return 'Trinity Sunday';
  if (sun === trinity) return `${W} in the Week of Trinity Sunday`;
  const may11 = utc(year, 4, 11);
  const proper = Math.min(29, Math.max(1, Math.round((sun - may11) / (7 * DAY)) + 1));
  return isSun ? `Proper ${proper}` : `${W} in the Week of Proper ${proper}`;
}
