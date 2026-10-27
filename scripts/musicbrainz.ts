// Minimal MusicBrainz + Cover Art Archive + Discogs clients for enrichment.
// MusicBrainz asks for ≤ 1 request/second and a descriptive User-Agent.

export interface MbTag {
  name: string;
  count: number;
}

export interface MbArtistCredit {
  name: string;
  joinphrase?: string;
  artist: { id: string; name: string; 'sort-name'?: string; type?: string | null; country?: string | null };
}

export interface MbTrack {
  number?: string;
  position?: number;
  title: string;
  length?: number | null;
  recording?: { length?: number | null };
}

export interface MbRelease {
  id: string;
  title: string;
  date?: string;
  country?: string | null;
  barcode?: string | null;
  'artist-credit'?: MbArtistCredit[];
  'label-info'?: { 'catalog-number'?: string | null; label?: { id: string; name: string } | null }[];
  media?: { format?: string | null; position?: number; tracks?: MbTrack[] }[];
  'release-group'?: MbReleaseGroup;
  genres?: MbTag[];
  tags?: MbTag[];
  relations?: { type: string; url?: { resource: string } }[];
}

export interface MbReleaseGroup {
  id: string;
  title?: string;
  'primary-type'?: string | null;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  genres?: MbTag[];
  tags?: MbTag[];
}

export interface MbArtist {
  id: string;
  name: string;
  'sort-name'?: string;
  type?: string | null;
  country?: string | null;
  gender?: string | null;
  area?: { name: string } | null;
  'begin-area'?: { name: string } | null;
  'life-span'?: { begin?: string | null };
  genres?: MbTag[];
  tags?: MbTag[];
}

export interface CaaImage {
  front: boolean;
  image: string;
  thumbnails: Record<string, string | undefined>;
}

export interface DiscogsRelease {
  uri?: string;
  genres?: string[];
  styles?: string[];
  community?: { have?: number; want?: number; rating?: { average?: number } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ClientOptions {
  userAgent: string;
  discogsToken?: string;
  fetchImpl?: typeof fetch;
}

export class MusicBrainz {
  private last = 0;
  private readonly userAgent: string;
  private readonly discogsToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.userAgent = opts.userAgent;
    this.discogsToken = opts.discogsToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get<T>(path: string, inc: string[]): Promise<T> {
    const url = `https://musicbrainz.org/ws/2/${path}?fmt=json${inc.length ? `&inc=${inc.join('+')}` : ''}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const wait = this.last + 1100 - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' } });
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz responded ${res.status} for ${path}`);
      return (await res.json()) as T;
    }
    throw new Error(`MusicBrainz kept saying it's busy (${path}); try again later.`);
  }

  release(mbid: string) {
    return this.get<MbRelease>(`release/${mbid}`, ['artist-credits', 'labels', 'recordings', 'release-groups', 'genres', 'tags', 'url-rels']);
  }

  releaseGroup(mbid: string) {
    return this.get<MbReleaseGroup>(`release-group/${mbid}`, ['genres', 'tags']);
  }

  artist(mbid: string) {
    return this.get<MbArtist>(`artist/${mbid}`, ['genres', 'tags']);
  }

  /** Front cover from the Cover Art Archive, trying the exact pressing first, then the album. */
  async cover(releaseMbid: string, releaseGroupMbid?: string): Promise<string | undefined> {
    const targets = [`release/${releaseMbid}`, ...(releaseGroupMbid ? [`release-group/${releaseGroupMbid}`] : [])];
    for (const target of targets) {
      try {
        const res = await this.fetchImpl(`https://coverartarchive.org/${target}`, { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' } });
        if (!res.ok) continue;
        const body = (await res.json()) as { images?: CaaImage[] };
        const img = body.images?.find((i) => i.front) ?? body.images?.[0];
        const url = img?.thumbnails['500'] ?? img?.thumbnails.large ?? img?.image;
        if (url) return url.replace(/^http:/, 'https:');
      } catch {
        // Cover art is nice-to-have; ignore network hiccups.
      }
    }
    return undefined;
  }

  async discogs(releaseId: string): Promise<DiscogsRelease | undefined> {
    try {
      const headers: Record<string, string> = { 'User-Agent': this.userAgent };
      if (this.discogsToken) headers.Authorization = `Discogs token=${this.discogsToken}`;
      const res = await this.fetchImpl(`https://api.discogs.com/releases/${releaseId}`, { headers });
      if (!res.ok) return undefined;
      return (await res.json()) as DiscogsRelease;
    } catch {
      return undefined;
    }
  }
}
