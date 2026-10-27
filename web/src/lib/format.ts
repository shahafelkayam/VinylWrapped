import { diffDays, formatDate, todayLocal } from '../../../shared/time.ts';

const nf = new Intl.NumberFormat('en');
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNumber = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : nf.format(Math.round(n)));

export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

/** 2,719 minutes → "45h 19m"; 42 → "42m". */
export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${fmtNumber(h)}h ${rest}m` : `${fmtNumber(h)}h`;
}

export const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  return h < 10 ? (Math.round(h * 10) / 10).toString() : fmtNumber(Math.round(h));
};

export function fmtDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } | undefined {
  if (!previous && !current) return undefined;
  if (!previous) return { text: 'new', direction: 'up' };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { text: '±0%', direction: 'flat' };
  return { text: `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`, direction: change > 0 ? 'up' : 'down' };
}

export function fmtAgo(date: string, today = todayLocal()): string {
  const d = diffDays(date, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365 * 2) return `${Math.round(d / 30.4)} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

export const fmtDay = (date: string) => formatDate(date);

export function fmtTime(at: string): string {
  const h = Number(at.slice(11, 13));
  const m = at.slice(14, 16);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string): string {
  if (code === 'XW') return 'Worldwide';
  if (code === 'XE') return 'Europe';
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// Windows has no flag emoji glyphs (it shows the two letters instead), so skip them there.
const flagsSupported = typeof navigator === 'undefined' || !/Windows/.test(navigator.userAgent);

export function flag(code: string): string {
  if (!flagsSupported) return '';
  if (!/^[A-Z]{2}$/.test(code) || code.startsWith('X')) return '🌍';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** "🇬🇧 United Kingdom" (or just the name where flags don't render). */
export const countryWithFlag = (code: string) => `${flag(code)} ${countryName(code)}`.trim();
