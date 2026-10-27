// The data model shared by the GitHub Actions "backend" (scripts/) and the web app (web/).
// Everything is persisted as two JSON files on the `data` branch: records.json and listens.json.

export interface Artist {
  name: string;
  mbid?: string;
  sortName?: string;
  /** Person, Group, Orchestra, Choir, ... */
  type?: string;
  /** ISO 3166-1 alpha-2 country of origin, e.g. "GB". */
  country?: string;
  /** Free-text home area, e.g. "Liverpool". */
  area?: string;
  gender?: string;
  /** Year born / formed, e.g. "1960". */
  begin?: string;
  genres: string[];
}

export interface Track {
  /** Vinyl position such as "A1" or "B3". */
  position: string;
  title: string;
  lengthMs?: number;
}

export interface DiscogsInfo {
  url: string;
  genres: string[];
  styles: string[];
  have?: number;
  want?: number;
  rating?: number;
}

export interface VinylRecord {
  /** Short, stable slug. This is what lives on the NFC tag. */
  id: string;
  title: string;
  /** Display credit, e.g. "Simon & Garfunkel". */
  artistCredit: string;
  artists: Artist[];
  /** Original release year of the album (MusicBrainz release group). */
  year?: number;
  /** Year this particular pressing came out. */
  pressingYear?: number;
  /** Country of this pressing (ISO alpha-2). */
  pressingCountry?: string;
  label?: string;
  catalogNumber?: string;
  /** e.g. '12" Vinyl' or '2×12" Vinyl'. */
  format?: string;
  discs?: number;
  /** Album, EP, Single, Compilation, Live, Soundtrack, ... */
  type?: string;
  /** Most relevant genres, best first. */
  genres: string[];
  /** Extra descriptive tags (moods, scenes, eras). */
  tags: string[];
  tracks: Track[];
  durationMs?: number;
  coverUrl?: string;
  mbid?: string;
  releaseGroupMbid?: string;
  discogs?: DiscogsInfo;
  notes?: string;
  addedAt: string;
}

/** Everything about a record except its identity in your crate. */
export type RecordFields = Omit<VinylRecord, 'id' | 'addedAt'>;

export type ListenSource = 'nfc' | 'shortcut' | 'web' | 'manual';

export interface Listen {
  id: string;
  /** VinylRecord.id. May point at a tag that has not been linked to a record yet. */
  record: string;
  /**
   * Local wall-clock time *with* its UTC offset, e.g. "2026-10-26T21:14:03+02:00".
   * Keeping the offset lets stats use the hour you actually listened at.
   */
  at: string;
  source: ListenSource;
}

export interface Library {
  records: Record<string, VinylRecord>;
  listens: Listen[];
}

// ---------------------------------------------------------------------------
// Events. Clients (the web app or an iPhone Shortcut) send these through
// GitHub's `repository_dispatch` API; the ingest workflow applies them.
// ---------------------------------------------------------------------------

export interface SpinPayload {
  record: string;
  id?: string;
  at?: string;
  source?: ListenSource;
  /** Log even if the same record was logged moments ago. */
  force?: boolean;
}

export interface AddRecordPayload {
  /** Desired slug (e.g. the id already written on an NFC tag). Generated if omitted. */
  id?: string;
  /** MusicBrainz release id to enrich from. */
  mbid?: string;
  /** Manual fields; used as-is when there's no mbid, or as overrides when there is. */
  manual?: Partial<Omit<VinylRecord, 'id' | 'addedAt'>>;
}

export interface UpdateRecordPayload {
  id: string;
  patch: Partial<Omit<VinylRecord, 'id' | 'addedAt'>>;
}

export interface IdPayload {
  id: string;
}

export interface EventMap {
  spin: SpinPayload;
  'add-record': AddRecordPayload;
  'update-record': UpdateRecordPayload;
  'refresh-record': IdPayload;
  'delete-record': IdPayload;
  'delete-listen': IdPayload;
}

export type EventType = keyof EventMap;

export const EVENT_TYPES: EventType[] = [
  'spin',
  'add-record',
  'update-record',
  'refresh-record',
  'delete-record',
  'delete-listen',
];

/** Assumed runtime for records whose tracklist has no lengths. */
export const DEFAULT_RECORD_MS = 42 * 60 * 1000;

/** A second scan of the same record inside this window is treated as an accidental double-tap. */
export const DUPLICATE_SPIN_WINDOW_MS = 5 * 60 * 1000;
