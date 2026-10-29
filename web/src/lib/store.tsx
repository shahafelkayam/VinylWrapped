// App-wide state: your account, your library, and the changes currently being saved.
// Writes go straight to Supabase (the database enforces who may change what); after each one
// the same pure operation is applied to the local copy so the UI updates instantly.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { EventMap, EventType, Library, Listen, RecordFields, VinylRecord } from '../../../shared/types.ts';
import { applyOp, type PreparedOp } from '../../../shared/ops.ts';
import { toLocalIso } from '../../../shared/time.ts';
import { newListenId, uniqueRecordId } from '../../../shared/ids.ts';
import { MusicBrainz } from '../../../shared/musicbrainz.ts';
import { enrichFromMusicBrainz } from '../../../shared/enrich.ts';
import { supabase } from './supabase.ts';
import * as api from './api.ts';
import { storage, type Settings } from './config.ts';
import { demoLibrary } from './demo.ts';

export type Mode = 'demo' | 'live';

export interface Me extends api.Profile {
  email?: string;
}

export interface PendingOp<E extends EventType = EventType> {
  key: string;
  type: E;
  payload: EventMap[E];
  sentAt: number;
}

interface StoreValue {
  /** Whether this build is connected to Supabase. Builds without one (local development) offer the demo crate instead. */
  backend: boolean;
  /** False until the saved session (if any) has been restored. */
  authReady: boolean;
  mode?: Mode;
  me?: Me;
  settings: Settings;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  library: Library;
  pending: PendingOp[];
  refresh: () => Promise<void>;
  send: <E extends EventType>(type: E, payload: EventMap[E], opts?: { preview?: RecordFields }) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: api.SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  startDemo: () => void;
  leaveDemo: () => void;
  saveProfile: (patch: { username?: string; displayName?: string; visibility?: api.Visibility }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateSettings: (s: Settings) => void;
  clearError: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: Library = { records: {}, listens: [] };

/** One client for enrichment so its 1-request-per-second pacing covers every lookup. */
const musicBrainz = new MusicBrainz({});

export function fieldsOf(rec: VinylRecord): RecordFields {
  const { id: _id, addedAt: _addedAt, ...fields } = rec;
  return fields;
}

function manualFields(manual: Partial<RecordFields> | undefined): RecordFields {
  const title = manual?.title?.trim();
  const artistCredit = manual?.artistCredit?.trim();
  if (!title || !artistCredit) throw new Error('A record needs at least a title and an artist.');
  return { artists: [{ name: artistCredit, genres: [] }], genres: [], tags: [], tracks: [], ...manual, title, artistCredit };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // The demo crate only exists when there's no database to sign in to.
  const [demo, setDemo] = useState(() => !supabase && storage.demo());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [me, setMe] = useState<Me>();
  const [settings, setSettings] = useState<Settings>(storage.settings);
  const [status, setStatus] = useState<StoreValue['status']>('idle');
  const [error, setError] = useState<string>();
  const [base, setBase] = useState<Library>(() => (demo ? demoLibrary() : EMPTY));
  const [pending, setPending] = useState<PendingOp[]>([]);
  const libRef = useRef(base);
  libRef.current = base;

  // Restore the saved session, then follow sign-ins, sign-outs and token refreshes.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Only update state here: calling Supabase from inside this callback can deadlock it.
      setSession(next);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  const email = session?.user.email;

  const load = useCallback(async () => {
    if (!userId) return;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const [profile, library] = await Promise.all([api.profileById(userId), api.fetchLibrary(userId)]);
      if (!profile) throw new Error('Your profile is missing. Try signing out and in again.');
      setMe({ ...profile, ...(email ? { email } : {}) });
      setBase(library);
      setStatus('ready');
      setError(undefined);
    } catch (err) {
      setError(api.friendlyError(err));
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [userId, email]);

  useEffect(() => {
    if (demo) {
      setStatus('ready');
      return;
    }
    if (userId) {
      void load();
    } else {
      setMe(undefined);
      setBase(EMPTY);
      setStatus('idle');
    }
  }, [demo, userId, load]);

  const applyLocal = useCallback((op: PreparedOp) => {
    setBase((lib) => {
      const copy: Library = { records: { ...lib.records }, listens: [...lib.listens] };
      try {
        applyOp(copy, op);
      } catch {
        // E.g. editing a record that was just removed elsewhere; the next refresh fixes it.
      }
      return copy;
    });
  }, []);

  /** Fetches full details from MusicBrainz in the browser and stores them on the record. */
  const enrichInto = useCallback(
    async (id: string, mbid: string) => {
      const fields = await enrichFromMusicBrainz(musicBrainz, mbid);
      const notes = libRef.current.records[id]?.notes;
      const merged = notes ? { ...fields, notes } : fields;
      if (!demo) await api.updateRecordData(id, merged);
      applyLocal({ type: 'refresh-record', id, record: merged });
    },
    [applyLocal, demo],
  );

  const send = useCallback<StoreValue['send']>(
    async (type, payload, opts) => {
      if (!demo && !me) throw new Error('Please sign in first.');
      const p = payload as never as Record<string, unknown>;
      const key = `${type}:${String(p.id ?? p.record ?? '')}:${Date.now()}:${Math.random()}`;
      const now = new Date();
      const done = () => setPending((list) => list.filter((i) => i.key !== key));
      setPending((list) => [...list, { key, type, payload, sentAt: Date.now() } as PendingOp]);

      let background: Promise<void> | undefined;
      try {
        switch (type) {
          case 'spin': {
            const s = payload as EventMap['spin'];
            const listen: Listen = { id: s.id ?? newListenId(), record: s.record, at: s.at ?? toLocalIso(now), source: s.source ?? 'web' };
            if (!demo) await api.insertListen(listen);
            applyLocal({ type: 'spin', listen, force: true });
            break;
          }
          case 'add-record': {
            const a = payload as EventMap['add-record'];
            const fields = opts?.preview ?? manualFields(a.manual);
            const id = a.id ?? uniqueRecordId(fields.title, (c) => c in libRef.current.records);
            if (!demo) await api.upsertRecord(id, fields);
            applyLocal({ type: 'add-record', id, record: fields, addedAt: toLocalIso(now) });
            // The record is saved; fill in genres, tracklist and artist details in the background.
            if (a.mbid) background = enrichInto(id, a.mbid);
            break;
          }
          case 'update-record': {
            const u = payload as EventMap['update-record'];
            const rec = libRef.current.records[u.id];
            if (!rec) throw new Error('That record isn’t in your crate anymore.');
            if (!demo) await api.updateRecordData(u.id, { ...fieldsOf(rec), ...u.patch });
            applyLocal({ type: 'update-record', id: u.id, patch: u.patch });
            break;
          }
          case 'refresh-record': {
            const rec = libRef.current.records[(payload as EventMap['refresh-record']).id];
            if (!rec?.mbid) throw new Error('This record was added by hand, so there’s nothing to refresh.');
            background = enrichInto(rec.id, rec.mbid);
            break;
          }
          case 'delete-record': {
            const id = (payload as EventMap['delete-record']).id;
            if (!demo) await api.deleteRecord(id);
            applyLocal({ type: 'delete-record', id });
            break;
          }
          case 'delete-listen': {
            const id = (payload as EventMap['delete-listen']).id;
            if (!demo) await api.deleteListen(id);
            applyLocal({ type: 'delete-listen', id });
            break;
          }
        }
      } catch (err) {
        done();
        throw new Error(api.friendlyError(err));
      }
      if (!background) {
        done();
        return;
      }
      background
        .catch((err: unknown) => setError(`Saved, but couldn’t fetch the details from MusicBrainz: ${api.friendlyError(err)}`))
        .finally(done);
    },
    [demo, me, applyLocal, enrichInto],
  );

  const resetLocal = () => {
    setMe(undefined);
    setBase(EMPTY);
    setPending([]);
    setStatus('idle');
    setError(undefined);
  };

  const value: StoreValue = {
    backend: Boolean(supabase),
    authReady,
    mode: demo ? 'demo' : session ? 'live' : undefined,
    me,
    settings,
    status,
    error,
    library: base,
    pending,
    refresh: load,
    send,
    signIn: async (username, password) => {
      await api.signInWithUsername(username.trim().toLowerCase(), password);
      storage.setDemo(false);
      setDemo(false);
    },
    signUp: async (input) => {
      const ready = await api.signUp(input);
      if (ready) {
        storage.setDemo(false);
        setDemo(false);
      }
      return ready;
    },
    signOut: async () => {
      await api.signOut();
      resetLocal();
    },
    startDemo: () => {
      if (supabase) return;
      storage.setDemo(true);
      setBase(demoLibrary());
      setDemo(true);
    },
    leaveDemo: () => {
      storage.setDemo(false);
      setDemo(false);
      resetLocal();
    },
    saveProfile: async (patch) => {
      if (!me) throw new Error('Please sign in first.');
      try {
        await api.updateProfile(me.id, {
          ...(patch.username !== undefined ? { username: patch.username.trim().toLowerCase() } : {}),
          ...(patch.displayName !== undefined ? { display_name: patch.displayName.trim() || null } : {}),
          ...(patch.visibility ? { visibility: patch.visibility } : {}),
        });
      } catch (err) {
        throw new Error(api.friendlyError(err));
      }
      setMe((m) =>
        m && {
          ...m,
          ...(patch.username !== undefined ? { username: patch.username.trim().toLowerCase() } : {}),
          ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() || undefined } : {}),
          ...(patch.visibility ? { visibility: patch.visibility } : {}),
        },
      );
    },
    deleteAccount: async () => {
      await api.deleteMyAccount();
      resetLocal();
    },
    updateSettings: (s) => {
      storage.setSettings(s);
      setSettings(s);
    },
    clearError: () => setError(undefined),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}
