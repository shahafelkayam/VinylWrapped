// App-wide state: who you are, your library, and an "outbox" of events sent to GitHub that
// haven't landed in the data branch yet. Outbox events are applied optimistically so the UI
// reacts instantly, then reconciled once the Ingest workflow commits them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EventMap, EventType, Library, RecordFields, VinylRecord } from '../../../shared/types.ts';
import { applyOp, type PreparedOp } from '../../../shared/ops.ts';
import { toLocalIso } from '../../../shared/time.ts';
import { GitHub, GitHubError } from './github.ts';
import { storage, type Session, type Settings } from './config.ts';
import { demoLibrary } from './demo.ts';

export type Mode = 'demo' | 'github';

export interface OutboxItem<E extends EventType = EventType> {
  key: string;
  type: E;
  payload: EventMap[E];
  sentAt: number;
  /** Data commit at the time we sent it; used to confirm events with no visible effect. */
  shaAtSend?: string | null;
  /** For add-record: what we already know, so the record shows up immediately. */
  preview?: RecordFields;
}

interface StoreValue {
  mode?: Mode;
  session?: Session;
  settings: Settings;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  library: Library;
  sha?: string | null;
  pending: OutboxItem[];
  refresh: () => Promise<void>;
  send: <E extends EventType>(type: E, payload: EventMap[E], opts?: { preview?: RecordFields }) => Promise<void>;
  login: (session: Session) => void;
  logout: () => void;
  startDemo: () => void;
  updateSettings: (s: Settings) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const OUTBOX_KEY = 'vw.outbox';
const OUTBOX_TTL_MS = 15 * 60_000;
const POLL_MS = 4000;

const EMPTY: Library = { records: {}, listens: [] };

function loadOutbox(): OutboxItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as OutboxItem[];
    return items.filter((i) => Date.now() - i.sentAt < OUTBOX_TTL_MS);
  } catch {
    return [];
  }
}

function toOp(item: OutboxItem): PreparedOp | undefined {
  const p = item.payload as never as Record<string, unknown>;
  switch (item.type) {
    case 'spin': {
      const s = item.payload as EventMap['spin'];
      return { type: 'spin', force: true, listen: { id: s.id!, record: s.record, at: s.at ?? toLocalIso(new Date(item.sentAt)), source: s.source ?? 'web' } };
    }
    case 'add-record':
      return item.preview ? { type: 'add-record', id: p.id as string, record: item.preview, addedAt: toLocalIso(new Date(item.sentAt)) } : undefined;
    case 'update-record':
      return { type: 'update-record', id: p.id as string, patch: p.patch as Partial<RecordFields> };
    case 'delete-record':
      return { type: 'delete-record', id: p.id as string };
    case 'delete-listen':
      return { type: 'delete-listen', id: p.id as string };
    default:
      return undefined;
  }
}

/** Applies events on top of a library without mutating it. */
export function withEvents(base: Library, items: OutboxItem[]): Library {
  if (!items.length) return base;
  const lib: Library = { records: { ...base.records }, listens: [...base.listens] };
  for (const item of items) {
    const op = toOp(item);
    if (!op) continue;
    try {
      applyOp(lib, op);
    } catch {
      // e.g. updating a record that isn't there anymore; ignore.
    }
  }
  return lib;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function isConfirmed(item: OutboxItem, base: Library, sha: string | null | undefined): boolean {
  const p = item.payload as never as Record<string, unknown>;
  switch (item.type) {
    case 'spin':
      return base.listens.some((l) => l.id === p.id);
    case 'add-record': {
      const rec = base.records[p.id as string];
      return !!rec && (p.mbid ? rec.mbid === p.mbid : rec.title === (p.manual as RecordFields | undefined)?.title);
    }
    case 'update-record': {
      const rec = base.records[p.id as string] as unknown as Record<string, unknown> | undefined;
      return !rec || Object.entries(p.patch as Record<string, unknown>).every(([k, v]) => same(rec[k], v));
    }
    case 'delete-record':
      return !base.records[p.id as string];
    case 'delete-listen':
      return !base.listens.some((l) => l.id === p.id);
    case 'refresh-record':
      return sha !== item.shaAtSend;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | undefined>(() => storage.mode());
  const [session, setSession] = useState<Session | undefined>(() => storage.session());
  const [settings, setSettings] = useState<Settings>(() => storage.settings());
  const [status, setStatus] = useState<StoreValue['status']>('idle');
  const [error, setError] = useState<string>();
  const [base, setBase] = useState<Library>(EMPTY);
  const [sha, setSha] = useState<string | null>();
  const [outbox, setOutbox] = useState<OutboxItem[]>(loadOutbox);
  const shaRef = useRef<string | null | undefined>(undefined);

  const client = useMemo(() => (session ? new GitHub(session.token) : undefined), [session]);

  useEffect(() => {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  }, [outbox]);

  const load = useCallback(
    async (quiet = false) => {
      if (mode === 'demo') {
        setBase((b) => (b === EMPTY ? demoLibrary() : b));
        setStatus('ready');
        return;
      }
      if (mode !== 'github' || !client || !session) return;
      if (!quiet) setStatus((s) => (s === 'ready' ? s : 'loading'));
      try {
        const { sha: newSha, library } = await client.library(session.dataRepo, session.dataBranch);
        shaRef.current = newSha;
        setSha(newSha);
        setBase(library);
        setOutbox((items) => items.filter((i) => !isConfirmed(i, library, newSha) && Date.now() - i.sentAt < OUTBOX_TTL_MS));
        setStatus('ready');
        setError(undefined);
      } catch (err) {
        setError((err as Error).message);
        setStatus((s) => (s === 'ready' ? s : 'error'));
        if (err instanceof GitHubError && err.status === 401) {
          storage.setSession(undefined);
          setSession(undefined);
        }
      }
    },
    [mode, client, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // While events are in flight, watch the data branch for the commit that contains them.
  useEffect(() => {
    if (mode !== 'github' || !client || !session || !outbox.length) return;
    const timer = setInterval(async () => {
      try {
        const current = await client.branchSha(session.dataRepo, session.dataBranch);
        if (current !== shaRef.current) await load(true);
        else setOutbox((items) => items.filter((i) => Date.now() - i.sentAt < OUTBOX_TTL_MS));
      } catch {
        // Network blip; try again next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [mode, client, session, outbox.length, load]);

  const send = useCallback<StoreValue['send']>(
    async (type, payload, opts) => {
      const p = payload as never as Record<string, unknown>;
      const item: OutboxItem = {
        key: `${type}:${(p.id as string) ?? (p.record as string) ?? Date.now()}:${Date.now()}`,
        type,
        payload,
        sentAt: Date.now(),
        shaAtSend: shaRef.current,
        preview: opts?.preview,
      };
      if (mode === 'demo') {
        // No backend in demo mode: apply locally and pretend it was committed.
        setBase((b) => withEvents(b, [item]));
        return;
      }
      if (!client || !session) throw new Error('Not logged in.');
      setOutbox((items) => [...items, item]);
      try {
        await client.dispatch(session.appRepo, type, payload);
      } catch (err) {
        setOutbox((items) => items.filter((i) => i.key !== item.key));
        throw err;
      }
    },
    [mode, client, session],
  );

  const library = useMemo(() => withEvents(base, outbox), [base, outbox]);

  const value: StoreValue = {
    mode,
    session,
    settings,
    status,
    error,
    library,
    sha,
    pending: outbox,
    refresh: () => load(),
    send,
    login: (s) => {
      storage.setSession(s);
      storage.setMode('github');
      setBase(EMPTY);
      setSession(s);
      setMode('github');
    },
    logout: () => {
      storage.setSession(undefined);
      storage.setMode(undefined);
      localStorage.removeItem(OUTBOX_KEY);
      setSession(undefined);
      setMode(undefined);
      setBase(EMPTY);
      setOutbox([]);
      setStatus('idle');
    },
    startDemo: () => {
      storage.setMode('demo');
      setBase(EMPTY);
      setMode('demo');
    },
    updateSettings: (s) => {
      storage.setSettings(s);
      setSettings(s);
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

export function useRecord(id: string): VinylRecord | undefined {
  return useStore().library.records[id];
}
