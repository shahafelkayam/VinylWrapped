// The Supabase client. URL + publishable key are public by design (they're in every page load);
// what protects the data is Row Level Security in supabase/migrations.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Null when the site was built without a backend (e.g. local development): only the demo works then. */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Password-reset and confirmation links land on the site with tokens in the URL.
          detectSessionInUrl: true,
          flowType: 'implicit',
          storageKey: 'vw.auth',
        },
      })
    : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('This site isn’t connected to its database yet.');
  return supabase;
}
