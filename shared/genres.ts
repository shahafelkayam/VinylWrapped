// MusicBrainz genres are lowercase and very specific ("hard bop", "neo-psychedelia").
// For display we title-case them, and for the big picture we roll them up into families.

const UPPER = new Set(['r&b', 'uk', 'us', 'idm', 'edm', 'ebm', 'dj', 'mpb', 'aor', 'lo-fi', 'k-pop', 'j-pop', 'idm']);

export function displayGenre(genre: string): string {
  return genre
    .trim()
    .split(/(\s+|-)/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (UPPER.has(lower)) return lower === 'lo-fi' ? 'Lo-Fi' : part.toUpperCase();
      if (lower === 'and' || lower === 'n') return lower;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

export const GENRE_FAMILIES = [
  'Rock',
  'Pop',
  'Jazz',
  'Electronic',
  'Hip Hop',
  'Soul & Funk',
  'Folk & Country',
  'Blues',
  'Classical',
  'Metal',
  'Punk',
  'Reggae',
  'Latin',
  'World',
  'Soundtrack',
  'Other',
] as const;

export type GenreFamily = (typeof GENRE_FAMILIES)[number];

// Checked in order: the first family with a matching keyword wins.
const FAMILY_KEYWORDS: [GenreFamily, string[]][] = [
  // Specific names that would otherwise be caught by a broader keyword further down.
  ['Electronic', ['dubstep', 'trip hop', 'drum and bass', 'synth-pop', 'synthpop', 'electropop']],
  ['Soul & Funk', ['new jack swing']],
  ['Rock', ['garage rock', 'symphonic rock', 'art rock', 'chamber pop']],
  ['Metal', ['metal', 'doom', 'sludge', 'djent', 'grindcore']],
  ['Soundtrack', ['soundtrack', 'score', 'video game', 'musical', 'show tunes']],
  ['Classical', ['classical', 'baroque', 'opera', 'symphony', 'chamber music', 'concerto', 'romanticism', 'minimalism', 'choral']],
  ['Hip Hop', ['hip hop', 'hip-hop', 'rap', 'trap', 'boom bap', 'grime', 'drill']],
  ['Punk', ['punk', 'hardcore']],
  ['Jazz', ['jazz', 'bop', 'swing', 'big band', 'dixieland', 'free improvisation']],
  ['Blues', ['blues']],
  ['Soul & Funk', ['soul', 'funk', 'r&b', 'rhythm and blues', 'motown', 'disco', 'gospel', 'new jack swing', 'boogie']],
  ['Reggae', ['reggae', 'dub', 'ska', 'dancehall', 'rocksteady']],
  ['Latin', ['latin', 'salsa', 'bossa nova', 'samba', 'tango', 'cumbia', 'reggaeton', 'mpb', 'tropicália', 'tropicalia', 'bolero', 'son cubano']],
  ['World', ['afrobeat', 'afro', 'highlife', 'world', 'flamenco', 'mizrahi', 'middle eastern', 'arabic', 'klezmer', 'celtic', 'fado', 'raï', 'qawwali', 'bhangra', 'chanson']],
  ['Folk & Country', ['folk', 'country', 'americana', 'bluegrass', 'singer-songwriter', 'singer/songwriter', 'honky tonk', 'outlaw']],
  ['Electronic', ['electronic', 'techno', 'house', 'ambient', 'trance', 'drum and bass', 'dubstep', 'idm', 'synth', 'edm', 'electro', 'downtempo', 'trip hop', 'breakbeat', 'garage', 'jungle', 'chillwave', 'vaporwave', 'industrial', 'dance', 'new age']],
  ['Pop', ['pop', 'schlager', 'easy listening', 'lounge', 'exotica', 'yé-yé', 'vocal']],
  ['Rock', ['rock', 'grunge', 'shoegaze', 'psychedel', 'prog', 'new wave', 'indie', 'alternative', 'britpop', 'krautrock', 'post-', 'emo', 'glam', 'surf', 'garage rock', 'math', 'noise', 'experimental']],
];

const familyCache = new Map<string, GenreFamily>();

export function genreFamily(genre: string): GenreFamily {
  const key = genre.toLowerCase();
  const cached = familyCache.get(key);
  if (cached) return cached;
  let found: GenreFamily = 'Other';
  for (const [family, keywords] of FAMILY_KEYWORDS) {
    if (keywords.some((k) => key.includes(k))) {
      found = family;
      break;
    }
  }
  familyCache.set(key, found);
  return found;
}

/** The family of a record: the family of its most relevant genre that maps to something. */
export function recordFamily(genres: string[]): GenreFamily {
  for (const g of genres) {
    const f = genreFamily(g);
    if (f !== 'Other') return f;
  }
  return 'Other';
}
