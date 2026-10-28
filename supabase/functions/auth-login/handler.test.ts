import { describe, expect, it, vi } from 'vitest';
import { handleLogin, type LoginDeps } from './handler.ts';

const SESSION = { access_token: 'a', refresh_token: 'r' };

function deps(overrides: Partial<LoginDeps> = {}) {
  const calls: string[] = [];
  const d: LoginDeps = {
    beginLogin: vi.fn(async (u: string) => (u === 'alice' ? { allowed: true, email: 'alice@example.com' } : { allowed: true, email: null })),
    finishLogin: vi.fn(async (u: string, ok: boolean) => {
      calls.push(`${u}:${ok ? 'ok' : 'fail'}`);
    }),
    signIn: vi.fn(async (_email: string, pw: string) => ({ session: pw === 'correct horse' ? SESSION : null })),
    ...overrides,
  };
  return { d, calls };
}

const post = (body: unknown) => new Request('https://x/functions/v1/auth-login', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('auth-login', () => {
  it('signs in with the right username and password, case-insensitively', async () => {
    const { d, calls } = deps();
    const res = await handleLogin(post({ username: ' Alice ', password: 'correct horse' }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: SESSION });
    expect(d.signIn).toHaveBeenCalledWith('alice@example.com', 'correct horse');
    expect(calls).toEqual(['alice:ok']);
  });

  it('gives the same answer for a wrong password and an unknown user, and counts both', async () => {
    const { d, calls } = deps();
    const wrong = await handleLogin(post({ username: 'alice', password: 'nope' }), d);
    const unknown = await handleLogin(post({ username: 'ghost', password: 'nope' }), d);
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(calls).toEqual(['alice:fail', 'ghost:fail']);
  });

  it('never reveals the email', async () => {
    const { d } = deps();
    for (const pw of ['nope', 'correct horse']) {
      const text = await (await handleLogin(post({ username: 'alice', password: pw }), d)).text();
      expect(text).not.toContain('alice@example.com');
    }
  });

  it('refuses locked-out usernames without checking the password', async () => {
    const { d } = deps({ beginLogin: vi.fn(async () => ({ allowed: false })) });
    const res = await handleLogin(post({ username: 'alice', password: 'correct horse' }), d);
    expect(res.status).toBe(429);
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it('rejects malformed input before touching the database', async () => {
    const { d } = deps();
    for (const body of ['not json', { username: 'a b', password: 'x' }, { username: 'alice' }, { username: 'alice', password: 'x'.repeat(201) }]) {
      const res = await handleLogin(post(body), d);
      expect([400, 401]).toContain(res.status);
    }
    expect(d.beginLogin).not.toHaveBeenCalled();
  });

  it('answers CORS preflight and hides internal errors', async () => {
    const { d } = deps({ beginLogin: vi.fn(async () => Promise.reject(new Error('db password is hunter2'))) });
    const pre = await handleLogin(new Request('https://x', { method: 'OPTIONS' }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleLogin(post({ username: 'alice', password: 'x' }), d);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('hunter2');
    spy.mockRestore();
  });
});
