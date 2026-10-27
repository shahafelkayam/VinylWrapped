import { describe, expect, it } from 'vitest';
import { displayGenre, genreFamily, recordFamily } from './genres.ts';

describe('genres', () => {
  it('title-cases MusicBrainz genres', () => {
    expect(displayGenre('progressive rock')).toBe('Progressive Rock');
    expect(displayGenre('r&b')).toBe('R&B');
    expect(displayGenre('neo-psychedelia')).toBe('Neo-Psychedelia');
    expect(displayGenre('drum and bass')).toBe('Drum and Bass');
  });

  it('rolls genres up into families', () => {
    expect(genreFamily('hard bop')).toBe('Jazz');
    expect(genreFamily('jazz rap')).toBe('Hip Hop');
    expect(genreFamily('dubstep')).toBe('Electronic');
    expect(genreFamily('roots reggae')).toBe('Reggae');
    expect(genreFamily('noise rock')).toBe('Rock');
    expect(genreFamily('symphonic metal')).toBe('Metal');
    expect(genreFamily('synth-pop')).toBe('Electronic');
    expect(genreFamily('dream pop')).toBe('Pop');
    expect(genreFamily('new jack swing')).toBe('Soul & Funk');
    expect(genreFamily('bossa nova')).toBe('Latin');
    expect(genreFamily('singer-songwriter')).toBe('Folk & Country');
    expect(genreFamily('zydeco-ish thing')).toBe('Other');
  });

  it('uses the first genre that maps to a family', () => {
    expect(recordFamily(['zzz', 'cool jazz', 'rock'])).toBe('Jazz');
    expect(recordFamily([])).toBe('Other');
  });
});
