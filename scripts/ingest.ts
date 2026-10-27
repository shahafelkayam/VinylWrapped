// The VinylWrapped "server": runs inside GitHub Actions for every repository_dispatch event.
//
//   node scripts/ingest.ts --data <dir>                       (in Actions; reads $GITHUB_EVENT_PATH)
//   node scripts/ingest.ts --local --data ./data --event spin --payload '{"record":"abbey-road"}'
//
// Flow: sync the data branch → prepare the event (MusicBrainz lookups etc.) → apply → commit → push.
// If the push loses a race with another run, re-sync and re-apply the already-prepared event.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { EVENT_TYPES, type EventType, type Library, type ListenSource } from '../shared/types.ts';
import { normalizeAt, toLocalIso } from '../shared/time.ts';
import { isValidRecordId, newListenId } from '../shared/ids.ts';
import { MusicBrainz } from './musicbrainz.ts';
import { enrichFromMusicBrainz, type EnrichedRecord } from './enrich.ts';
import { applyOp, serializeListens, serializeRecords, type PreparedOp } from '../shared/ops.ts';

const SOURCES: ListenSource[] = ['nfc', 'shortcut', 'web', 'manual'];
const MBID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const log = (msg: string) => console.log(msg);

// ---------------------------------------------------------------------------
// Event intake
// ---------------------------------------------------------------------------

interface IncomingEvent {
  type: EventType;
  payload: Record<string, unknown>;
}

function readEvent(cli: { event?: string; payload?: string }): IncomingEvent {
  let type: string | undefined = cli.event;
  let payload: unknown = cli.payload ? JSON.parse(cli.payload) : undefined;

  if (!type && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (event.client_payload !== undefined || event.action) {
      // repository_dispatch: event_type arrives as `action`.
      type = event.action;
      payload = event.client_payload ?? {};
    } else if (event.inputs) {
      // workflow_dispatch from the Actions tab.
      type = event.inputs.event;
      payload = event.inputs.payload ? JSON.parse(event.inputs.payload) : {};
    }
  }
  if (!type || !EVENT_TYPES.includes(type as EventType)) {
    throw new Error(`Unknown event type "${type}". Expected one of: ${EVENT_TYPES.join(', ')}`);
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Event payload must be a JSON object.');
  }
  return { type: type as EventType, payload: payload as Record<string, unknown> };
}

/** Accepts a bare id, or a full tag URL like https://you.github.io/VinylWrapped/#/spin/abbey-road. */
export function normalizeRecordId(raw: unknown): string {
  const text = String(raw ?? '').trim();
  const fromUrl = /\/spin\/([A-Za-z0-9-]+)/.exec(text);
  const id = (fromUrl ? fromUrl[1] : text).toLowerCase();
  if (!isValidRecordId(id)) throw new Error(`"${text}" isn't a valid record id (use lowercase letters, digits and dashes).`);
  return id;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const strList = (v: unknown) =>
  Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

/** Keeps only known, well-typed fields from user-supplied record data. */
export function sanitizeRecordFields(input: unknown): Partial<EnrichedRecord> {
  if (!input || typeof input !== 'object') return {};
  const o = input as Record<string, unknown>;
  const out: Partial<EnrichedRecord> = {};
  const s = { title: str(o.title), artistCredit: str(o.artistCredit), label: str(o.label), catalogNumber: str(o.catalogNumber), format: str(o.format), type: str(o.type), notes: str(o.notes), pressingCountry: str(o.pressingCountry) };
  for (const [k, v] of Object.entries(s)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  const n = { year: num(o.year), pressingYear: num(o.pressingYear), durationMs: num(o.durationMs), discs: num(o.discs) };
  for (const [k, v] of Object.entries(n)) if (v !== undefined) (out as Record<string, unknown>)[k] = Math.round(v);
  const genres = strList(o.genres);
  if (genres) out.genres = genres.map((g) => g.toLowerCase());
  const tags = strList(o.tags);
  if (tags) out.tags = tags.map((t) => t.toLowerCase());
  const cover = str(o.coverUrl);
  if (cover && /^https:\/\//.test(cover)) out.coverUrl = cover;
  if (o.notes === '') out.notes = '';
  return out;
}

function manualRecord(fields: Partial<EnrichedRecord>): EnrichedRecord {
  if (!fields.title || !fields.artistCredit) throw new Error('A record without a MusicBrainz id needs at least a title and an artistCredit.');
  return {
    artists: [{ name: fields.artistCredit, genres: [] }],
    genres: [],
    tags: [],
    tracks: [],
    ...fields,
    title: fields.title,
    artistCredit: fields.artistCredit,
  };
}

interface Context {
  library: Library;
  now: Date;
  timeZone: string;
  mb: MusicBrainz;
}

export async function prepare(event: IncomingEvent, ctx: Context): Promise<PreparedOp> {
  const p = event.payload;
  switch (event.type) {
    case 'spin': {
      const source = SOURCES.includes(p.source as ListenSource) ? (p.source as ListenSource) : 'shortcut';
      const id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(p.id) ? p.id : newListenId(ctx.now.getTime());
      return {
        type: 'spin',
        listen: { id, record: normalizeRecordId(p.record), at: normalizeAt(str(p.at), ctx.now, ctx.timeZone), source },
        force: p.force === true,
      };
    }
    case 'add-record': {
      const id = p.id !== undefined && p.id !== '' ? normalizeRecordId(p.id) : undefined;
      const overrides = sanitizeRecordFields(p.manual);
      const mbid = MBID_RE.exec(String(p.mbid ?? ''))?.[0]?.toLowerCase();
      const record = mbid ? { ...(await enrichFromMusicBrainz(ctx.mb, mbid, log)), ...overrides } : manualRecord(overrides);
      return { type: 'add-record', id, record, addedAt: toLocalIso(ctx.now, ctx.timeZone) };
    }
    case 'update-record': {
      const id = normalizeRecordId(p.id);
      const patch = sanitizeRecordFields(p.patch);
      if (!Object.keys(patch).length) throw new Error('update-record needs a non-empty "patch".');
      return { type: 'update-record', id, patch };
    }
    case 'refresh-record': {
      const id = normalizeRecordId(p.id);
      const existing = ctx.library.records[id];
      if (!existing) throw new Error(`No record with id "${id}".`);
      if (!existing.mbid) throw new Error(`"${id}" was added manually, so there's nothing to refresh from MusicBrainz.`);
      return { type: 'refresh-record', id, record: await enrichFromMusicBrainz(ctx.mb, existing.mbid, log) };
    }
    case 'delete-record':
      return { type: 'delete-record', id: normalizeRecordId(p.id) };
    case 'delete-listen': {
      const id = str(p.id);
      if (!id) throw new Error('delete-listen needs an "id".');
      return { type: 'delete-listen', id };
    }
  }
}

// ---------------------------------------------------------------------------
// Storage: two JSON files on the data branch.
// ---------------------------------------------------------------------------

const DATA_README = `# VinylWrapped data

This branch is written by the **Ingest** workflow. Every commit is one event (a spin, a new record, an edit).

- \`records.json\`: your crate, keyed by the id written on each NFC tag
- \`listens.json\`: every needle drop, one per line, local time with UTC offset

You can edit these by hand if you need to; the app reads whatever is here.
`;

export function readLibrary(dir: string): Library {
  const read = <T>(file: string, fallback: T): T => {
    const path = join(dir, file);
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
  };
  const records = read<Library['records']>('records.json', {});
  const listens = read<Library['listens']>('listens.json', []);
  if (typeof records !== 'object' || Array.isArray(records)) throw new Error('records.json must be an object keyed by record id.');
  if (!Array.isArray(listens)) throw new Error('listens.json must be an array.');
  return { records, listens };
}

export function writeLibrary(dir: string, library: Library): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'records.json'), serializeRecords(library.records));
  writeFileSync(join(dir, 'listens.json'), serializeListens(library.listens));
  if (!existsSync(join(dir, 'README.md'))) writeFileSync(join(dir, 'README.md'), DATA_README);
}

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

function git(dir: string, args: string[], allowFail = false): { ok: boolean; out: string } {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  if (res.status !== 0 && !allowFail) throw new Error(`git ${args[0]} failed: ${out}`);
  return { ok: res.status === 0, out };
}

/** Makes `dir` an exact copy of the remote data branch (or an empty orphan if it doesn't exist yet). */
function syncDataBranch(dir: string, remote: string, branch: string): void {
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-q']);
    git(dir, ['remote', 'add', 'origin', remote]);
  }
  const fetched = git(dir, ['fetch', '-q', '--depth', '1', 'origin', branch], true);
  if (fetched.ok) {
    git(dir, ['checkout', '-q', '-B', branch, 'FETCH_HEAD']);
    git(dir, ['reset', '-q', '--hard', 'FETCH_HEAD']);
    git(dir, ['clean', '-q', '-fd']);
    return;
  }
  if (!/couldn't find remote ref|not found/i.test(fetched.out)) throw new Error(`Could not fetch the data branch: ${fetched.out}`);
  log(`Data branch "${branch}" doesn't exist yet; it will be created.`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
}

function commitAndPush(dir: string, branch: string, message: string): boolean {
  git(dir, ['add', '-A']);
  if (git(dir, ['diff', '--cached', '--quiet'], true).ok) return true; // nothing staged
  git(dir, ['-c', 'user.name=VinylWrapped', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', message]);
  const pushed = git(dir, ['push', '-q', 'origin', `HEAD:refs/heads/${branch}`], true);
  if (!pushed.ok) log(`Push rejected (probably a concurrent run): ${pushed.out.split('\n')[0]}`);
  return pushed.ok;
}

function summary(line: string) {
  log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: 'string', default: 'data' },
      local: { type: 'boolean', default: false },
      event: { type: 'string' },
      payload: { type: 'string' },
    },
  });
  const dir = values.data!;
  const event = readEvent(values);
  const timeZone = process.env.VW_TIMEZONE || 'UTC';
  const repo = process.env.GITHUB_REPOSITORY ?? 'local/vinylwrapped';
  const mb = new MusicBrainz({
    userAgent: `VinylWrapped/0.1 (+https://github.com/${repo})`,
    discogsToken: process.env.DISCOGS_TOKEN || undefined,
  });
  log(`Event: ${event.type} ${JSON.stringify(event.payload)}`);

  if (values.local) {
    const library = readLibrary(dir);
    const op = await prepare(event, { library, now: new Date(), timeZone, mb });
    const result = applyOp(library, op);
    if (result.changed) writeLibrary(dir, library);
    summary(result.message);
    return;
  }

  const dataRepo = process.env.DATA_REPO || repo;
  const branch = process.env.DATA_BRANCH || 'data';
  // DATA_REMOTE_URL lets you point at any git remote (handy for testing against a local bare repo).
  let remote = process.env.DATA_REMOTE_URL;
  if (!remote) {
    const token = process.env.DATA_TOKEN;
    if (!token) throw new Error('DATA_TOKEN is not set.');
    remote = `https://x-access-token:${token}@github.com/${dataRepo}.git`;
  }

  let op: PreparedOp | undefined;
  for (let attempt = 1; attempt <= 10; attempt++) {
    syncDataBranch(dir, remote, branch);
    const library = readLibrary(dir);
    op ??= await prepare(event, { library, now: new Date(), timeZone, mb });
    const result = applyOp(library, op);
    if (!result.changed) {
      summary(result.message);
      return;
    }
    writeLibrary(dir, library);
    if (commitAndPush(dir, branch, result.message)) {
      summary(result.message);
      return;
    }
    const backoff = 1000 * attempt + Math.random() * 2000;
    log(`Retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1})…`);
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw new Error('Gave up after repeated push conflicts.');
}

if (import.meta.main) {
  main().catch((err: Error) => {
    console.error(`::error::${err.message}`);
    process.exitCode = 1;
  });
}
