import { describe, expect, it } from 'vitest';
import { rankAlbums, type AlbumHit } from './musicbrainz.ts';

const hit = (id: string, title: string, artist: string, year: number, type = 'Album', score = 100): AlbumHit => ({ id, title, artist, year, type, score });

describe('rankAlbums', () => {
  it('prefers the original studio album even when MusicBrainz scores a compilation higher', () => {
    const ranked = rankAlbums(
      [
        hit('compilation', 'Fleetwood Mac / Rumours', 'Fleetwood Mac', 1981, 'Compilation'),
        hit('original', 'Rumours', 'Fleetwood Mac', 1977, 'Album', 82),
        hit('live', 'Rumours Live', 'Fleetwood Mac', 2023, 'Live'),
      ],
      'rumours fleetwood mac',
    );
    expect(ranked[0].id).toBe('original');
  });

  it('breaks ties with the earliest release', () => {
    const ranked = rankAlbums([hit('remaster', 'Blue', 'Joni Mitchell', 2021), hit('first', 'Blue', 'Joni Mitchell', 1971)], 'blue joni mitchell');
    expect(ranked.map((h) => h.id)).toEqual(['first', 'remaster']);
  });

  it('matches titles regardless of accents and punctuation', () => {
    const ranked = rankAlbums([hit('other', 'Debut', 'Björk', 1993), hit('homogenic', 'Homogenic', 'Björk', 1997)], 'homogenic bjork');
    expect(ranked[0].id).toBe('homogenic');
  });
});
