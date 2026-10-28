// Turns a MusicBrainz release id into a fully described VinylRecord.
import type { Artist, DiscogsInfo, RecordFields, Track } from './types.ts';
import type { MbArtist, MbRelease, MbReleaseGroup, MbTag, MusicBrainz } from './musicbrainz.ts';

export type EnrichedRecord = RecordFields;

const SECONDARY_TYPES_THAT_MATTER = ['Live', 'Compilation', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo'];
const JUNK_TAG = /^(\d+s?|vinyl|lp|cd|album|seen live|favorites?|favourites?|my collection|owned|check out|to listen|\d{4} release)$/i;

export function yearOf(date?: string | null): number | undefined {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 1800 ? y : undefined;
}

/** '12" Vinyl' ×2 → '2×12" Vinyl'; mixed media are joined with " + ". */
export function summarizeFormat(media: MbRelease['media'] = []): string | undefined {
  const counts = new Map<string, number>();
  for (const m of media) {
    const f = m.format ?? 'Unknown';
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  if (!counts.size) return undefined;
  return [...counts.entries()].map(([f, n]) => (n > 1 ? `${n}×${f}` : f)).join(' + ');
}

export function tracksOf(release: MbRelease): { tracks: Track[]; durationMs?: number } {
  const tracks: Track[] = [];
  let known = 0;
  let total = 0;
  for (const medium of release.media ?? []) {
    for (const t of medium.tracks ?? []) {
      const lengthMs = t.length ?? t.recording?.length ?? undefined;
      tracks.push({ position: t.number || String(t.position ?? tracks.length + 1), title: t.title, ...(lengthMs ? { lengthMs } : {}) });
      if (lengthMs) {
        known += 1;
        total += lengthMs;
      }
    }
  }
  if (!known || known < tracks.length / 2) return { tracks };
  // Estimate the missing tracks with the average of the known ones.
  const durationMs = Math.round(total + (tracks.length - known) * (total / known));
  return { tracks, durationMs };
}

/** Ranks genres across the album (strongest signal), this pressing, and the main artist. */
export function rankGenres(sources: { tags?: MbTag[]; weight: number }[], limit = 5): string[] {
  const score = new Map<string, number>();
  for (const { tags, weight } of sources) {
    for (const t of tags ?? []) {
      if (t.count < 1) continue;
      const key = t.name.toLowerCase();
      score.set(key, (score.get(key) ?? 0) + weight * t.count);
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

export function pickTags(genres: string[], tagLists: (MbTag[] | undefined)[], limit = 8): string[] {
  const genreSet = new Set(genres.map((g) => g.toLowerCase()));
  const score = new Map<string, number>();
  for (const list of tagLists) {
    for (const t of list ?? []) {
      const key = t.name.toLowerCase().trim();
      if (t.count < 1 || genreSet.has(key) || JUNK_TAG.test(key) || key.length > 30) continue;
      score.set(key, (score.get(key) ?? 0) + t.count);
    }
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

export function artistFrom(credit: { name: string; artist: { id: string; name: string } }, details?: MbArtist): Artist {
  return {
    name: credit.name || credit.artist.name,
    mbid: credit.artist.id,
    ...(details?.['sort-name'] ? { sortName: details['sort-name'] } : {}),
    ...(details?.type ? { type: details.type } : {}),
    ...(details?.country ? { country: details.country } : {}),
    ...(details?.area?.name || details?.['begin-area']?.name ? { area: details?.['begin-area']?.name ?? details?.area?.name } : {}),
    ...(details?.gender ? { gender: details.gender } : {}),
    ...(details?.['life-span']?.begin ? { begin: details['life-span'].begin!.slice(0, 4) } : {}),
    genres: rankGenres([{ tags: details?.genres, weight: 1 }], 4),
  };
}

export function buildRecord(input: {
  release: MbRelease;
  releaseGroup?: MbReleaseGroup;
  artists: Map<string, MbArtist>;
  coverUrl?: string;
  discogs?: DiscogsInfo;
}): EnrichedRecord {
  const { release, artists, coverUrl, discogs } = input;
  const rg = input.releaseGroup ?? release['release-group'];
  const credits = release['artist-credit'] ?? [];
  const artistList = credits.map((c) => artistFrom(c, artists.get(c.artist.id)));
  const artistCredit = credits.map((c) => `${c.name}${c.joinphrase ?? ''}`).join('').trim() || 'Unknown Artist';
  const primaryArtist = credits[0] ? artists.get(credits[0].artist.id) : undefined;

  let genres = rankGenres([
    { tags: rg?.genres, weight: 3 },
    { tags: release.genres, weight: 2 },
    { tags: primaryArtist?.genres, weight: 1 },
  ]);
  if (!genres.length && discogs) genres = [...discogs.styles, ...discogs.genres].map((g) => g.toLowerCase()).slice(0, 5);

  const tags = pickTags(genres, [rg?.tags, release.tags, discogs?.styles.map((s) => ({ name: s, count: 1 }))]);
  const { tracks, durationMs } = tracksOf(release);
  const labelInfo = release['label-info']?.find((l) => l.label?.name) ?? release['label-info']?.[0];
  const secondary = rg?.['secondary-types']?.find((t) => SECONDARY_TYPES_THAT_MATTER.includes(t));

  const record: EnrichedRecord = {
    title: release.title,
    artistCredit,
    artists: artistList,
    genres,
    tags,
    tracks,
    mbid: release.id,
  };
  const year = yearOf(rg?.['first-release-date']) ?? yearOf(release.date);
  const pressingYear = yearOf(release.date);
  if (year) record.year = year;
  if (pressingYear) record.pressingYear = pressingYear;
  if (release.country) record.pressingCountry = release.country;
  if (labelInfo?.label?.name) record.label = labelInfo.label.name.replace(/\s*\(\d+\)$/, '');
  if (labelInfo?.['catalog-number']) record.catalogNumber = labelInfo['catalog-number'];
  const format = summarizeFormat(release.media);
  if (format) record.format = format;
  if (release.media?.length) record.discs = release.media.length;
  const type = secondary ?? rg?.['primary-type'];
  if (type) record.type = type;
  if (durationMs) record.durationMs = durationMs;
  if (coverUrl) record.coverUrl = coverUrl;
  if (rg?.id) record.releaseGroupMbid = rg.id;
  if (discogs) record.discogs = discogs;
  return record;
}

export function discogsReleaseId(release: MbRelease): string | undefined {
  for (const rel of release.relations ?? []) {
    const m = /discogs\.com\/release\/(\d+)/.exec(rel.url?.resource ?? '');
    if (m) return m[1];
  }
  return undefined;
}

export async function enrichFromMusicBrainz(mb: MusicBrainz, mbid: string, log: (msg: string) => void = () => {}): Promise<EnrichedRecord> {
  log(`Looking up release ${mbid} on MusicBrainz…`);
  const release = await mb.release(mbid);
  const rgId = release['release-group']?.id;
  const releaseGroup = rgId ? await mb.releaseGroup(rgId) : undefined;

  const artists = new Map<string, MbArtist>();
  for (const credit of (release['artist-credit'] ?? []).slice(0, 4)) {
    if (artists.has(credit.artist.id)) continue;
    try {
      artists.set(credit.artist.id, await mb.artist(credit.artist.id));
    } catch (err) {
      log(`  (skipping artist details for ${credit.name}: ${(err as Error).message})`);
    }
  }

  const coverUrl = await mb.cover(release.id, rgId);
  let discogs: DiscogsInfo | undefined;
  const discogsId = discogsReleaseId(release);
  if (discogsId) {
    const d = await mb.discogs(discogsId);
    if (d) {
      discogs = {
        url: d.uri ?? `https://www.discogs.com/release/${discogsId}`,
        genres: d.genres ?? [],
        styles: d.styles ?? [],
        ...(d.community?.have !== undefined ? { have: d.community.have } : {}),
        ...(d.community?.want !== undefined ? { want: d.community.want } : {}),
        ...(d.community?.rating?.average ? { rating: Math.round(d.community.rating.average * 100) / 100 } : {}),
      };
    }
  }

  const record = buildRecord({ release, releaseGroup, artists, coverUrl, discogs });
  log(`  → ${record.artistCredit} — ${record.title} (${record.year ?? 'year unknown'}) · ${record.genres.join(', ') || 'no genres yet'}`);
  return record;
}
