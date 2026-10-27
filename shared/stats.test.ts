import { describe, expect, it } from 'vitest';
import type { Library, Listen, VinylRecord } from './types.ts';
import { computeRecordStats, computeStats, previousRange } from './stats.ts';

function rec(id: string, extra: Partial<VinylRecord> = {}): VinylRecord {
  return {
    id,
    title: id.toUpperCase(),
    artistCredit: `${id} artist`,
    artists: [{ name: `${id} artist`, country: 'GB', genres: [] }],
    genres: ['rock'],
    tags: [],
    tracks: [],
    durationMs: 40 * 60_000,
    addedAt: '2025-01-01T00:00:00+00:00',
    ...extra,
  };
}

let n = 0;
const spin = (record: string, at: string): Listen => ({ id: `l${n++}`, record, at, source: 'nfc' });

const library: Library = {
  records: {
    abbey: rec('abbey', { year: 1969, genres: ['rock', 'pop rock'], label: 'Apple' }),
    kind: rec('kind', { year: 1959, genres: ['cool jazz', 'jazz'], artists: [{ name: 'Miles Davis', country: 'US', genres: [] }], label: 'Columbia' }),
    blue: rec('blue', { year: 2024, genres: ['indie rock'] }),
    dusty: rec('dusty', { year: 1975 }),
  },
  listens: [
    spin('kind', '2025-03-01T22:00:00+02:00'),
    spin('abbey', '2026-10-01T21:00:00+03:00'),
    spin('abbey', '2026-10-01T21:45:00+03:00'),
    spin('kind', '2026-10-02T23:30:00+03:00'),
    spin('abbey', '2026-10-03T08:00:00+03:00'),
    spin('blue', '2026-10-05T14:00:00+03:00'),
    spin('ghost-tag', '2026-10-06T20:00:00+03:00'),
    spin('abbey', '2026-09-20T20:00:00+03:00'),
  ],
};

describe('computeStats', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };
  const stats = computeStats(library, range, { today: '2026-10-06' });

  it('totals the range', () => {
    expect(stats.totals.spins).toBe(6);
    expect(stats.totals.records).toBe(3);
    expect(stats.totals.activeDays).toBe(5);
    expect(stats.totals.minutes).toBe(5 * 40 + 42); // the unlinked tag falls back to the default runtime
  });

  it('ranks records, artists, genres and families', () => {
    expect(stats.topRecords.map((r) => [r.key, r.count])).toEqual([
      ['abbey', 3],
      ['blue', 1],
      ['kind', 1],
    ]);
    expect(stats.topArtists[0].item.name).toBe('abbey artist');
    expect(stats.topGenres.slice(0, 2).map((g) => [g.key, g.count])).toEqual([['pop rock', 3], ['rock', 3]]);
    expect(stats.topFamilies.map((f) => f.key)).toEqual(['Rock', 'Jazz']);
    expect(stats.topCountries.map((c) => [c.key, c.count])).toEqual([
      ['GB', 4],
      ['US', 1],
    ]);
    expect(stats.decades.map((d) => d.item)).toEqual([1950, 1960, 2020]);
  });

  it('knows when you listen', () => {
    expect(stats.hours[21]).toBe(2);
    expect(stats.hours[8]).toBe(1);
    expect(stats.weekdays[3]).toBe(2); // 2026-10-01 is a Thursday
    expect(stats.shares.night).toBeCloseTo(3 / 6); // 21:00, 21:45 and 23:30
  });

  it('finds streaks, sessions and binges', () => {
    expect(stats.longestStreak).toEqual({ length: 3, from: '2026-10-01', to: '2026-10-03' });
    expect(stats.currentStreak.length).toBe(2); // Oct 5 + Oct 6
    expect(stats.longestSession?.spins).toBe(2);
    expect(stats.binge).toMatchObject({ date: '2026-10-01', value: 2 });
    expect(stats.peakDay).toEqual({ date: '2026-10-01', count: 2 });
  });

  it('spots discoveries, comebacks, dusty records and unlinked tags', () => {
    expect(stats.discoveries.map((d) => d.record.id)).toEqual(['blue']);
    expect(stats.comebacks.map((c) => [c.record.id, c.value])).toEqual([['kind', 580]]);
    expect(stats.dusty.map((d) => d.record.id)).toEqual(['dusty']);
    expect(stats.unlinkedTags).toEqual([{ id: 'ghost-tag', count: 1, lastAt: '2026-10-06T20:00:00+03:00' }]);
  });

  it('compares with the previous period', () => {
    expect(previousRange(range)).toEqual({ from: '2026-08-31', to: '2026-09-30' });
    expect(stats.previous.spins).toBe(1);
  });

  it('builds trend buckets for the whole range', () => {
    expect(stats.granularity).toBe('day');
    expect(stats.trend).toHaveLength(31);
    expect(stats.trend[0]).toMatchObject({ start: '2026-10-01', count: 2 });
  });

  it('computes era stats', () => {
    expect(stats.era.oldest?.id).toBe('kind');
    expect(stats.era.newest?.id).toBe('blue');
    expect(stats.era.medianYear).toBe(1969);
  });
});

describe('computeRecordStats', () => {
  it('summarizes a single record', () => {
    const s = computeRecordStats(library, 'abbey', '2026-10-06');
    expect(s.spins).toBe(4);
    expect(s.rank).toBe(1);
    expect(s.firstSpin).toBe('2026-09-20');
    expect(s.lastSpin).toBe('2026-10-03');
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly.at(-1)).toMatchObject({ start: '2026-10-01', count: 3 });
  });
});
