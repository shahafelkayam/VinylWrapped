// Per-device preferences in localStorage. (Your session is kept by the Supabase client.)

export interface Settings {
  /** Weekend days, Monday = 0 … Sunday = 6. */
  weekend: number[];
}

const KEYS = { demo: 'vw.demo', settings: 'vw.settings' };

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
  demo: () => read<boolean>(KEYS.demo) === true,
  setDemo: (on: boolean) => write(KEYS.demo, on ? true : undefined),
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

/** The URL to write on an NFC tag for one of your records. */
export function tagUrl(recordId: string): string {
  return `${location.origin}${location.pathname}#/spin/${recordId}`;
}
