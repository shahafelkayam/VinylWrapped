// Username + password sign-in. Supabase Auth signs people in by email, so this server-side function
// looks up the email behind a username (with the secret key, which never reaches the browser),
// checks the password with Supabase Auth, and hands the session back. The browser never learns
// anyone's email, and a username is locked for 15 minutes after 10 wrong passwords.
//
// Kept free of Deno APIs so it can be unit-tested; index.ts wires it to Supabase.

export interface LoginDeps {
  /** {allowed:false} while the username is locked out, otherwise its email (null if unknown). */
  beginLogin(username: string): Promise<{ allowed: boolean; email?: string | null }>;
  finishLogin(username: string, success: boolean): Promise<void>;
  /** Checks the password with Supabase Auth; returns the session on success. */
  signIn(email: string, password: string): Promise<{ session: unknown | null; rateLimited?: boolean }>;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const MAX_PASSWORD = 200;

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

const WRONG = { error: 'Wrong username or password.' };
const LOCKED = { error: 'Too many attempts. Try again in 15 minutes.' };

export async function handleLogin(req: Request, deps: LoginDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Send JSON: {"username": …, "password": …}.' });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!USERNAME_RE.test(username) || !password || password.length > MAX_PASSWORD) return json(401, WRONG);

  try {
    const gate = await deps.beginLogin(username);
    if (!gate.allowed) return json(429, LOCKED);
    if (!gate.email) {
      // Unknown usernames count as failures too, so guessing names is throttled the same way.
      await deps.finishLogin(username, false);
      return json(401, WRONG);
    }
    const result = await deps.signIn(gate.email, password);
    if (result.rateLimited) return json(429, LOCKED);
    if (!result.session) {
      await deps.finishLogin(username, false);
      return json(401, WRONG);
    }
    await deps.finishLogin(username, true);
    return json(200, { session: result.session });
  } catch (err) {
    console.error('auth-login failed:', err instanceof Error ? err.message : err);
    return json(500, { error: 'Sign-in is unavailable right now. Please try again.' });
  }
}
