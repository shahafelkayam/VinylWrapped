// Build-time defaults (set by the Deploy workflow) + per-device state in localStorage.

export interface Session {
  token: string;
  /** Repo with the Ingest workflow; repository_dispatch events go here. */
  appRepo: string;
  /** Repo + branch holding records.json / listens.json. */
  dataRepo: string;
  dataBranch: string;
  login?: string;
  avatarUrl?: string;
}

export interface Settings {
  /** Weekend days, Monday = 0 … Sunday = 6. */
  weekend: number[];
}

/** "owner/repo" from a GitHub Pages URL like https://owner.github.io/repo/. */
function repoFromLocation(): string {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : '';
}

const detected = repoFromLocation();

export const BUILD = {
  appRepo: import.meta.env.VITE_APP_REPO || detected,
  dataRepo: import.meta.env.VITE_DATA_REPO || import.meta.env.VITE_APP_REPO || detected,
  dataBranch: import.meta.env.VITE_DATA_BRANCH || 'data',
};

const KEYS = { session: 'vw.session', mode: 'vw.mode', settings: 'vw.settings' };

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  if (value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  session: () => read<Session>(KEYS.session),
  setSession: (s: Session | undefined) => write(KEYS.session, s),
  mode: () => read<'demo' | 'github'>(KEYS.mode),
  setMode: (m: 'demo' | 'github' | undefined) => write(KEYS.mode, m),
  settings: (): Settings => ({ weekend: defaultWeekend(), ...read<Partial<Settings>>(KEYS.settings) }),
  setSettings: (s: Settings) => write(KEYS.settings, s),
};

function defaultWeekend(): number[] {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { weekend: number[] };
      weekInfo?: { weekend: number[] };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    // Intl uses 1 = Monday … 7 = Sunday.
    if (info?.weekend?.length) return info.weekend.map((d) => d - 1);
  } catch {
    // Older browsers: fall through.
  }
  return [5, 6];
}

/** The URL to write on an NFC tag for a record. */
export function tagUrl(recordId: string): string {
  return `${location.origin}${location.pathname}#/spin/${recordId}`;
}
