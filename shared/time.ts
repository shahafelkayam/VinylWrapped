// Time helpers. Listens store local wall-clock time + offset ("2026-10-26T21:14:03+02:00"),
// and date ranges are plain local dates ("2026-10-26"), so most math here is string/UTC based
// and never depends on the timezone of whoever is looking at the stats.

const DAY_MS = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    });
    formatterCache.set(key, f);
  }
  return f;
}

/** Formats an instant as local ISO-8601 with offset, in `timeZone` (default: the runtime's zone). */
export function toLocalIso(date: Date, timeZone?: string): string {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  const tzName = parts.timeZoneName ?? 'GMT';
  const offset = tzName === 'GMT' ? '+00:00' : tzName.slice(3);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

const OFFSET_RE = /([+-])(\d{2}):?(\d{2})$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/;

/**
 * Turns whatever a client sent (Shortcuts, browsers, humans) into canonical local ISO with offset.
 * - Has an offset → kept as wall-clock time.
 * - Ends in Z → converted into `timeZone`.
 * - No zone at all → interpreted as wall-clock time in `timeZone`.
 * - Missing or unparseable → `now` in `timeZone`.
 */
export function normalizeAt(input: string | undefined, now: Date, timeZone: string): string {
  const raw = input?.trim();
  if (!raw) return toLocalIso(now, timeZone);

  const local = LOCAL_RE.exec(raw);
  if (!local) {
    const parsed = Date.parse(raw);
    return toLocalIso(Number.isNaN(parsed) ? now : new Date(parsed), timeZone);
  }
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = local;
  const wall = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

  const off = OFFSET_RE.exec(raw.slice(local[0].length));
  if (off) return `${wall}${off[1]}${off[2]}:${off[3]}`;
  if (/z$/i.test(raw)) return toLocalIso(new Date(`${wall}Z`), timeZone);

  // Wall-clock time in `timeZone`: find the offset that zone had around that moment.
  const guess = Date.parse(`${wall}Z`);
  if (Number.isNaN(guess)) return toLocalIso(now, timeZone);
  const offsetMin = offsetMinutes(new Date(guess), timeZone);
  return toLocalIso(new Date(guess - offsetMin * 60_000), timeZone);
}

function offsetMinutes(date: Date, timeZone: string): number {
  const iso = toLocalIso(date, timeZone);
  const m = OFFSET_RE.exec(iso)!;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -mins : mins;
}

export interface LocalParts {
  /** "YYYY-MM-DD" in the listener's local time. */
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export function localParts(at: string): LocalParts {
  const date = at.slice(0, 10);
  const year = Number(at.slice(0, 4));
  const month = Number(at.slice(5, 7));
  const day = Number(at.slice(8, 10));
  const hour = Number(at.slice(11, 13)) || 0;
  const minute = Number(at.slice(14, 16)) || 0;
  return { date, year, month, day, hour, minute, weekday: weekdayOf(date) };
}

/** Absolute instant in ms; robust to the offset suffix. */
export function instantOf(at: string): number {
  return Date.parse(at);
}

export function weekdayOf(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function todayLocal(now = new Date()): string {
  return toLocalIso(now).slice(0, 10);
}

export function startOfWeek(date: string, weekStartsOn = 0): string {
  const wd = weekdayOf(date); // Monday-based
  return addDays(date, -((wd - weekStartsOn + 7) % 7));
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? 'am' : 'pm'}`;
}

export function formatDate(date: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}${opts.year === false ? '' : `, ${y}`}`;
}
