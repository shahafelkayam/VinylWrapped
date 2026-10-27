import { describe, expect, it } from 'vitest';
import { buildRecord, pickTags, rankGenres, summarizeFormat, tracksOf } from './enrich.ts';
import type { MbRelease } from './musicbrainz.ts';

const release: MbRelease = {
  id: 'rel-1',
  title: 'Abbey Road',
  date: '1969-09-26',
  country: 'GB',
  'artist-credit': [{ name: 'The Beatles', joinphrase: '', artist: { id: 'beatles', name: 'The Beatles' } }],
  'label-info': [{ 'catalog-number': 'PCS 7088', label: { id: 'apple', name: 'Apple Records' } }],
  media: [
    { format: '12" Vinyl', tracks: [{ number: 'A1', title: 'Come Together', length: 259_000 }, { number: 'A2', title: 'Something', recording: { length: 182_000 } }] },
    { format: '12" Vinyl', tracks: [{ number: 'B1', title: 'Here Comes the Sun', length: null }] },
  ],
  'release-group': { id: 'rg-1', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '1969-09-26' },
  genres: [{ name: 'pop rock', count: 2 }],
  relations: [{ type: 'discogs', url: { resource: 'https://www.discogs.com/release/123' } }],
};

describe('enrichment helpers', () => {
  it('summarizes media formats', () => {
    expect(summarizeFormat(release.media)).toBe('2×12" Vinyl');
    expect(summarizeFormat([{ format: '12" Vinyl' }, { format: '7" Vinyl' }])).toBe('12" Vinyl + 7" Vinyl');
  });

  it('collects tracks and estimates missing lengths', () => {
    const { tracks, durationMs } = tracksOf(release);
    expect(tracks.map((t) => t.position)).toEqual(['A1', 'A2', 'B1']);
    expect(durationMs).toBe(259_000 + 182_000 + (259_000 + 182_000) / 2);
  });

  it('weights album genres above pressing and artist genres', () => {
    const genres = rankGenres([
      { tags: [{ name: 'Rock', count: 3 }], weight: 3 },
      { tags: [{ name: 'pop rock', count: 2 }], weight: 2 },
      { tags: [{ name: 'psychedelic pop', count: 1 }, { name: 'ignored', count: 0 }], weight: 1 },
    ]);
    expect(genres).toEqual(['rock', 'pop rock', 'psychedelic pop']);
  });

  it('filters junk tags and genres out of tags', () => {
    expect(pickTags(['rock'], [[{ name: 'rock', count: 9 }, { name: '1969', count: 4 }, { name: 'vinyl', count: 3 }, { name: 'british', count: 2 }]])).toEqual(['british']);
  });

  it('builds a record', () => {
    const rec = buildRecord({ release, artists: new Map([['beatles', { id: 'beatles', name: 'The Beatles', type: 'Group', country: 'GB', area: { name: 'Liverpool' }, 'life-span': { begin: '1960-08' }, genres: [{ name: 'rock', count: 5 }] }]]) });
    expect(rec).toMatchObject({
      title: 'Abbey Road',
      artistCredit: 'The Beatles',
      year: 1969,
      label: 'Apple Records',
      catalogNumber: 'PCS 7088',
      format: '2×12" Vinyl',
      discs: 2,
      type: 'Album',
      genres: ['rock', 'pop rock'], // the artist's strong 'rock' vote outweighs the pressing's 'pop rock'
      artists: [{ name: 'The Beatles', type: 'Group', country: 'GB', area: 'Liverpool', begin: '1960', genres: ['rock'] }],
    });
  });
});
