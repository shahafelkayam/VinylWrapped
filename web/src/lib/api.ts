// Everything the app reads from and writes to Supabase. Access rules live in the database
// (supabase/migrations), so these functions can be simple: the server refuses what isn't allowed.
import type { Artist, Library, Listen, ListenSource, RecordFields, Track, VinylRecord } from '../../../shared/types.ts';
import { toLocalIso } from '../../../shared/time.ts';
import { requireSupabase, SUPABASE_KEY, SUPABASE_URL } from './supabase.ts';

export type Visibility = 'public' | 'members' | 'private';

export interface Profile {
  id: string;
  username: string;
  displayName?: string;
  visibility: Visibility;
  createdAt: string;
}

export interface DirectoryEntry {
  username: string;
  displayName?: string;
  visibility: Visibility;
  records: number;
  spins: number;
  lastSpin?: string;
  joined: string;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;

const PAGE = 1000;

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Turns database / auth errors into something a person can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | undefined;
  const msg = e?.message ?? String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Can’t reach the server. Check your connection and try again.';
  if (/JWT expired|invalid JWT|refresh token/i.test(msg)) return 'Your session expired. Please sign in again.';
  if (/record_data_cover/.test(msg)) return 'Covers can only come from the Cover Art Archive or Discogs.';
  if (/record_id_format|listen_record_format/.test(msg)) return 'Tag ids use lowercase letters, numbers and dashes.';
  if (/username_format/.test(msg)) return 'Usernames are 3–20 lowercase letters, numbers or underscores.';
  if (/username_not_reserved/.test(msg)) return 'That username is reserved. Pick another one.';
  if (/profiles_username_key|duplicate key.*username|Database error saving new user/i.test(msg)) return 'That username is taken (or invalid). Pick another one.';
  if (/at most 5,000 records|at most 100,000 spins/.test(msg)) return msg;
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
  return msg;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data;
}

// ---------------------------------------------------------------------------------------------
// Reading. Other people's data is untrusted, so rows are normalized before the UI sees them.
// ---------------------------------------------------------------------------------------------

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
const strList = (v: unknown, max = 20) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter((x): x is string => !!x).slice(0, max) : []);
const SAFE_COVER = /^https:\/\/(coverartarchive\.org|([a-z0-9-]+\.)*archive\.org|i\.discogs\.com)\//;

/** Coerces stored record data into the shape the app expects, dropping anything unexpected. */
export function normalizeRecordFields(data: unknown): RecordFields {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const artists: Artist[] = (Array.isArray(d.artists) ? d.artists : []).slice(0, 10).flatMap((a): Artist[] => {
    const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    const name = str(o.name, 120);
    if (!name) return [];
    return [
      {
        name,
        ...(str(o.mbid, 40) ? { mbid: str(o.mbid, 40) } : {}),
        ...(str(o.type, 30) ? { type: str(o.type, 30) } : {}),
        ...(typeof o.country === 'string' && /^[A-Z]{2}$/.test(o.country) ? { country: o.country } : {}),
        ...(str(o.area, 80) ? { area: str(o.area, 80) } : {}),
        ...(str(o.begin, 10) ? { begin: str(o.begin, 10) } : {}),
        genres: strList(o.genres, 6),
      },
    ];
  });
  const tracks: Track[] = (Array.isArray(d.tracks) ? d.tracks : []).slice(0, 200).flatMap((t): Track[] => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    const title = str(o.title, 200);
    if (!title) return [];
    const lengthMs = int(o.lengthMs);
    return [{ position: str(o.position, 8) ?? '', title, ...(lengthMs && lengthMs > 0 ? { lengthMs } : {}) }];
  });
  const title = str(d.title) ?? 'Untitled';
  const artistCredit = str(d.artistCredit, 200) ?? (artists.map((a) => a.name).join(', ') || 'Unknown artist');
  const fields: RecordFields = { title, artistCredit, artists, genres: strList(d.genres, 8), tags: strList(d.tags, 12), tracks };
  const optional: [keyof RecordFields, unknown][] = [
    ['year', int(d.year)],
    ['pressingYear', int(d.pressingYear)],
    ['pressingCountry', typeof d.pressingCountry === 'string' && /^[A-Z]{2}$/.test(d.pressingCountry) ? d.pressingCountry : undefined],
    ['label', str(d.label, 120)],
    ['catalogNumber', str(d.catalogNumber, 60)],
    ['format', str(d.format, 60)],
    ['discs', int(d.discs)],
    ['type', str(d.type, 30)],
    ['durationMs', int(d.durationMs)],
    ['coverUrl', typeof d.coverUrl === 'string' && SAFE_COVER.test(d.coverUrl) ? d.coverUrl : undefined],
    ['mbid', str(d.mbid, 40)],
    ['releaseGroupMbid', str(d.releaseGroupMbid, 40)],
    ['notes', typeof d.notes === 'string' ? d.notes.slice(0, 2000) : undefined],
  ];
  for (const [k, v] of optional) if (v !== undefined) (fields as unknown as Record<string, unknown>)[k] = v;
  const disc = d.discogs as Record<string, unknown> | undefined;
  if (disc && typeof disc === 'object' && typeof disc.url === 'string' && /^https:\/\/(www\.)?discogs\.com\//.test(disc.url)) {
    fields.discogs = {
      url: disc.url,
      genres: strList(disc.genres, 6),
      styles: strList(disc.styles, 10),
      ...(int(disc.have) !== undefined ? { have: int(disc.have) } : {}),
      ...(int(disc.want) !== undefined ? { want: int(disc.want) } : {}),
      ...(typeof disc.rating === 'number' ? { rating: Math.round(disc.rating * 100) / 100 } : {}),
    };
  }
  return fields;
}

const SOURCES: ListenSource[] = ['nfc', 'shortcut', 'web', 'manual'];

function toProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    username: String(row.username),
    ...(typeof row.display_name === 'string' ? { displayName: row.display_name } : {}),
    visibility: (['public', 'members', 'private'].includes(row.visibility as string) ? row.visibility : 'members') as Visibility,
    createdAt: String(row.created_at),
  };
}

export async function profileById(id: string): Promise<Profile | null> {
  const row = check(await requireSupabase().from('profiles').select('id, username, display_name, visibility, created_at').eq('id', id).maybeSingle());
  return row ? toProfile(row) : null;
}

/** Null when the user doesn't exist *or* their profile isn't visible to you; the database won't say which. */
export async function profileByUsername(username: string): Promise<Profile | null> {
  const row = check(
    await requireSupabase().from('profiles').select('id, username, display_name, visibility, created_at').eq('username', username.toLowerCase()).maybeSingle(),
  );
  return row ? toProfile(row) : null;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await build(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** One listener's crate and spins (yours, or someone else's if their visibility allows it). */
export async function fetchLibrary(userId: string): Promise<Library> {
  const sb = requireSupabase();
  const [recordRows, listenRows] = await Promise.all([
    fetchAll<{ id: string; data: unknown; added_at: string }>((a, b) => sb.from('records').select('id, data, added_at').eq('user_id', userId).order('id').range(a, b)),
    fetchAll<{ id: string; record_id: string; at: string; source: string }>((a, b) =>
      sb.from('listens').select('id, record_id, at, source').eq('user_id', userId).order('id').range(a, b),
    ),
  ]);
  const records: Record<string, VinylRecord> = {};
  for (const r of recordRows) records[r.id] = { ...normalizeRecordFields(r.data), id: r.id, addedAt: toLocalIso(new Date(r.added_at)) };
  const listens: Listen[] = listenRows
    .map((l) => ({ id: l.id, record: l.record_id, at: l.at, source: (SOURCES.includes(l.source as ListenSource) ? l.source : 'web') as ListenSource }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { records, listens };
}

export async function directory(): Promise<DirectoryEntry[]> {
  const rows = check(await requireSupabase().rpc('directory')) as Record<string, unknown>[] | null;
  return (rows ?? []).map((r) => ({
    username: String(r.username),
    ...(typeof r.display_name === 'string' ? { displayName: r.display_name } : {}),
    visibility: r.visibility as Visibility,
    records: Number(r.records ?? 0),
    spins: Number(r.spins ?? 0),
    ...(typeof r.last_spin === 'string' ? { lastSpin: r.last_spin } : {}),
    joined: String(r.joined),
  }));
}

// ---------------------------------------------------------------------------------------------
// Writing your own data
// ---------------------------------------------------------------------------------------------

export async function insertListen(l: Listen): Promise<void> {
  check(await requireSupabase().from('listens').insert({ id: l.id, record_id: l.record, at: l.at, source: l.source }));
}

export async function deleteListen(id: string): Promise<void> {
  check(await requireSupabase().from('listens').delete().eq('id', id));
}

/** Adds a record, or replaces the one already linked to this tag id. */
export async function upsertRecord(id: string, fields: RecordFields): Promise<void> {
  check(await requireSupabase().from('records').upsert({ id, data: fields }, { onConflict: 'user_id,id' }));
}

export async function updateRecordData(id: string, fields: RecordFields): Promise<void> {
  check(await requireSupabase().from('records').update({ data: fields }).eq('id', id));
}

/** Also removes the record's spins (a database trigger takes care of that). */
export async function deleteRecord(id: string): Promise<void> {
  check(await requireSupabase().from('records').delete().eq('id', id));
}

export async function updateProfile(id: string, patch: { username?: string; display_name?: string | null; visibility?: Visibility }): Promise<void> {
  check(await requireSupabase().from('profiles').update(patch).eq('id', id));
}

export async function deleteMyAccount(): Promise<void> {
  const sb = requireSupabase();
  check(await sb.rpc('delete_my_account'));
  await sb.auth.signOut({ scope: 'local' });
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

export async function usernameAvailable(name: string): Promise<boolean> {
  return Boolean(check(await requireSupabase().rpc('username_available', { name })));
}

/** Username sign-in goes through the auth-login Edge Function, which never reveals emails. */
export async function signInWithUsername(username: string, password: string): Promise<void> {
  const sb = requireSupabase();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ username, password }),
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; session?: { access_token: string; refresh_token: string } };
  if (!res.ok || !body.session) throw new Error(body.error ?? 'Sign-in failed. Please try again.');
  check(await sb.auth.setSession({ access_token: body.session.access_token, refresh_token: body.session.refresh_token }));
}

export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

/** Returns true when the account is ready to use, false when the email must be confirmed first. */
export async function signUp(input: SignUpInput): Promise<boolean> {
  const sb = requireSupabase();
  const username = input.username.trim().toLowerCase();
  if (!(await usernameAvailable(username))) throw new Error('That username is taken (or reserved). Pick another one.');
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { username, ...(input.displayName?.trim() ? { display_name: input.displayName.trim() } : {}) },
      emailRedirectTo: siteUrl(),
    },
  });
  if (error) throw new Error(friendlyError(error));
  return Boolean(data.session);
}

export async function requestPasswordReset(email: string): Promise<void> {
  check(await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() }));
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw new Error(friendlyError(error));
}

export async function signOut(): Promise<void> {
  await requireSupabase().auth.signOut();
}

/** Where emailed links should send people back to: this site's root, without any hash route. */
export function siteUrl(): string {
  return `${location.origin}${location.pathname}`;
}
