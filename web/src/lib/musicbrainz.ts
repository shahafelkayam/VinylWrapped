// Browser-side MusicBrainz search for the "Add a record" flow. MusicBrainz allows CORS
// and asks for at most one request per second, so calls are queued.

export interface AlbumHit {
  id: string;
  title: string;
  artist: string;
  year?: number;
  type?: string;
  score: number;
}

export interface Pressing {
  id: string;
  title: string;
  date?: string;
  country?: string;
  format: string;
  label?: string;
  catalogNumber?: string;
  trackCount: number;
  hasCover: boolean;
  isVinyl: boolean;
}

interface MbCredit {
  name: string;
  joinphrase?: string;
}

let queue: Promise<unknown> = Promise.resolve();
let last = 0;

function mb<T>(path: string): Promise<T> {
  const run = async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    for (let attempt = 0; attempt < 4; attempt++) {
      last = Date.now();
      const res = await fetch(`https://musicbrainz.org/ws/2/${path}${path.includes('?') ? '&' : '?'}fmt=json`, { headers: { Accept: 'application/json' } });
      if (res.status === 503 || res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz responded ${res.status}`);
      return (await res.json()) as T;
    }
    throw new Error('MusicBrainz is busy right now. Try again in a moment.');
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

const credit = (c?: MbCredit[]) => (c ?? []).map((a) => `${a.name}${a.joinphrase ?? ''}`).join('').trim();
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined);

export async function searchAlbums(text: string): Promise<AlbumHit[]> {
  const q = encodeURIComponent(text.trim());
  const body = await mb<{
    'release-groups'?: { id: string; title: string; score: number; 'first-release-date'?: string; 'primary-type'?: string; 'secondary-types'?: string[]; 'artist-credit'?: MbCredit[] }[];
  }>(`release-group/?query=${q}&dismax=true&limit=24`);
  const hits = (body['release-groups'] ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    artist: credit(g['artist-credit']),
    year: yearOf(g['first-release-date']),
    type: g['secondary-types']?.[0] ?? g['primary-type'],
    score: g.score,
  }));
  return rankAlbums(hits, text);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * MusicBrainz scores many hits 100, compilations and bootlegs included. Prefer plain studio
 * albums whose title and artist actually appear in what you typed, then the original (earliest) one.
 */
export function rankAlbums(hits: AlbumHit[], query: string): AlbumHit[] {
  const q = ` ${norm(query)} `;
  const bonus = (h: AlbumHit) =>
    (h.type === 'Album' ? 15 : h.type === 'EP' ? 5 : 0) + (q.includes(` ${norm(h.title)} `) ? 15 : 0) + (h.artist && q.includes(` ${norm(h.artist)} `) ? 5 : 0);
  return [...hits].sort((a, b) => b.score + bonus(b) - (a.score + bonus(a)) || (a.year ?? 9999) - (b.year ?? 9999));
}

export async function pressingsOf(releaseGroupId: string): Promise<Pressing[]> {
  type Rel = {
    id: string;
    title: string;
    date?: string;
    country?: string;
    'label-info'?: { 'catalog-number'?: string; label?: { name: string } }[];
    media?: { format?: string; 'track-count'?: number }[];
    'cover-art-archive'?: { front?: boolean };
  };
  const out: Rel[] = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const body = await mb<{ releases?: Rel[]; 'release-count'?: number }>(`release?release-group=${releaseGroupId}&inc=labels+media&limit=100&offset=${offset}`);
    out.push(...(body.releases ?? []));
    if (out.length >= (body['release-count'] ?? 0)) break;
  }
  return out
    .map((r) => {
      const formats = (r.media ?? []).map((m) => m.format ?? 'Unknown');
      const counts = new Map<string, number>();
      for (const f of formats) counts.set(f, (counts.get(f) ?? 0) + 1);
      const li = r['label-info']?.find((l) => l.label?.name);
      return {
        id: r.id,
        title: r.title,
        date: r.date,
        country: r.country,
        format: [...counts].map(([f, n]) => (n > 1 ? `${n}×${f}` : f)).join(' + ') || 'Unknown format',
        label: li?.label?.name,
        catalogNumber: li?.['catalog-number'],
        trackCount: (r.media ?? []).reduce((a, m) => a + (m['track-count'] ?? 0), 0),
        hasCover: !!r['cover-art-archive']?.front,
        isVinyl: formats.some((f) => /vinyl/i.test(f)),
      };
    })
    .sort((a, b) => Number(b.isVinyl) - Number(a.isVinyl) || Number(b.hasCover) - Number(a.hasCover) || (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

export const albumCover = (releaseGroupId: string, size: 250 | 500 = 250) => `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}`;
export const pressingCover = (releaseId: string, size: 250 | 500 = 250) => `https://coverartarchive.org/release/${releaseId}/front-${size}`;
