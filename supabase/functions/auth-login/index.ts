// Supabase Edge Function entry point (Deno). Deployed by .github/workflows/supabase.yml.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleLogin } from './handler.ts';

/** Supabase injects API keys as JSON dictionaries (SUPABASE_SECRET_KEYS etc.); older projects use single keys. */
function apiKey(kind: 'SECRET' | 'PUBLISHABLE'): string {
  const dict = Deno.env.get(`SUPABASE_${kind}_KEYS`);
  if (dict) {
    try {
      const first = Object.values(JSON.parse(dict) as Record<string, string>)[0];
      if (first) return first;
    } catch {
      // Fall through to the single-key variables.
    }
  }
  const legacy = kind === 'SECRET' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY';
  const key = Deno.env.get(`SUPABASE_${kind}_KEY`) ?? Deno.env.get(legacy);
  if (!key) throw new Error(`No ${kind.toLowerCase()} API key available to the function.`);
  return key;
}

const url = Deno.env.get('SUPABASE_URL')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, apiKey('SECRET'), noSession);
const publishableKey = apiKey('PUBLISHABLE');

Deno.serve((req) =>
  handleLogin(req, {
    async beginLogin(username) {
      const { data, error } = await admin.rpc('begin_login', { p_username: username });
      if (error) throw new Error(error.message);
      return data as { allowed: boolean; email?: string | null };
    },
    async finishLogin(username, success) {
      const { error } = await admin.rpc('finish_login', { p_username: username, p_success: success });
      if (error) throw new Error(error.message);
    },
    async signIn(email, password) {
      const client = createClient(url, publishableKey, noSession);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { session: null, rateLimited: error.status === 429 };
      return { session: data.session };
    },
  }),
);
