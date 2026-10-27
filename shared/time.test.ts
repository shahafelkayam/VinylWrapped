import { describe, expect, it } from 'vitest';
import { addDays, diffDays, localParts, normalizeAt, startOfWeek, toLocalIso } from './time.ts';

const NOW = new Date('2026-10-26T19:14:03Z');

describe('toLocalIso', () => {
  it('formats in a named zone with its offset, including DST', () => {
    expect(toLocalIso(NOW, 'Asia/Jerusalem')).toBe('2026-10-26T21:14:03+02:00');
    expect(toLocalIso(new Date('2026-07-01T12:00:00Z'), 'Asia/Jerusalem')).toBe('2026-07-01T15:00:00+03:00');
    expect(toLocalIso(NOW, 'UTC')).toBe('2026-10-26T19:14:03+00:00');
    expect(toLocalIso(NOW, 'America/New_York')).toBe('2026-10-26T15:14:03-04:00');
  });
});

describe('normalizeAt', () => {
  const tz = 'Asia/Jerusalem';
  it('defaults to now', () => {
    expect(normalizeAt(undefined, NOW, tz)).toBe('2026-10-26T21:14:03+02:00');
    expect(normalizeAt('   ', NOW, tz)).toBe('2026-10-26T21:14:03+02:00');
  });
  it('keeps explicit offsets as wall-clock time', () => {
    expect(normalizeAt('2026-10-20T08:00:00-05:00', NOW, tz)).toBe('2026-10-20T08:00:00-05:00');
    expect(normalizeAt('2026-10-20T08:00:00.123+0530', NOW, tz)).toBe('2026-10-20T08:00:00+05:30');
  });
  it('converts UTC into the configured zone', () => {
    expect(normalizeAt('2026-10-20T08:00:00Z', NOW, tz)).toBe('2026-10-20T11:00:00+03:00');
  });
  it('treats zone-less times as local to the configured zone', () => {
    expect(normalizeAt('2026-10-20T21:30', NOW, tz)).toBe('2026-10-20T21:30:00+03:00');
    expect(normalizeAt('2026-12-20 09:05', NOW, tz)).toBe('2026-12-20T09:05:00+02:00');
  });
  it('falls back to now for garbage', () => {
    expect(normalizeAt('yesterday-ish', NOW, tz)).toBe('2026-10-26T21:14:03+02:00');
  });
});

describe('date math', () => {
  it('reads local parts straight from the string', () => {
    expect(localParts('2026-10-26T23:59:00-07:00')).toMatchObject({ date: '2026-10-26', hour: 23, minute: 59, weekday: 0 });
    expect(localParts('2026-11-01T00:10:00+09:00').weekday).toBe(6);
  });
  it('adds and diffs days across boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
  });
  it('finds the start of the week', () => {
    expect(startOfWeek('2026-10-29')).toBe('2026-10-26');
    expect(startOfWeek('2026-10-29', 5)).toBe('2026-10-24'); // Saturday
    expect(startOfWeek('2026-10-29', 6)).toBe('2026-10-25'); // Sunday
  });
});
