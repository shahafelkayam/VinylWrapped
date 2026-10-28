// Runs the real migration in an in-process Postgres (PGlite) with a minimal stand-in for
// Supabase's environment, then checks the security rules by acting as different users.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

// What Supabase provides before our migration runs: roles, auth.users, auth.uid(), and the
// default grants it adds to everything created in the public schema.
const SUPABASE_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant select, insert, update, delete on auth.users to supabase_auth_admin;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

let db: PGlite;

async function exec(sql: string) {
  return db.exec(sql);
}

/** Runs one statement as a given identity and returns its rows. */
async function as<T = Record<string, unknown>>(who: 'anon' | 'service' | { user: string }, sql: string, params: unknown[] = []): Promise<T[]> {
  if (who === 'anon') await exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  else if (who === 'service') await exec(`set role service_role; select set_config('request.jwt.claim.sub', '', false);`);
  else await exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who.user}', false);`);
  try {
    const res = await db.query<T>(sql, params);
    return res.rows;
  } finally {
    await exec('reset role;');
  }
}

/** Signs a user up the way Supabase Auth does: a row in auth.users with the form's metadata. */
async function signUp(username: string, extra: Record<string, string> = {}): Promise<string> {
  await exec('set role supabase_auth_admin;');
  try {
    const res = await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      `${username.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`,
      JSON.stringify({ username, ...extra }),
    ]);
    return res.rows[0].id;
  } finally {
    await exec('reset role;');
  }
}

const record = (title = 'Kind of Blue', extra: Record<string, unknown> = {}) =>
  JSON.stringify({ title, artistCredit: 'Miles Davis', artists: [], genres: ['jazz'], tags: [], tracks: [], ...extra });

let alice: string; // public
let bob: string; // members (default)
let carol: string; // private
let dave: string; // members, no records

beforeAll(async () => {
  db = new PGlite();
  await exec(SUPABASE_STANDIN);
  for (const file of readdirSync(MIGRATIONS).sort()) await exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
});

beforeEach(async () => {
  await exec('reset role; delete from auth.users; delete from private.login_failures;');
  alice = await signUp('Alice', { display_name: 'Alice A.' });
  bob = await signUp('bob');
  carol = await signUp('carol');
  dave = await signUp('dave');
  await as({ user: alice }, `update public.profiles set visibility = 'public' where id = auth.uid()`);
  await as({ user: carol }, `update public.profiles set visibility = 'private' where id = auth.uid()`);
  for (const [who, id] of [
    [alice, 'kind-of-blue'],
    [bob, 'abbey-road'],
    [carol, 'blue'],
  ] as const) {
    await as({ user: who }, `insert into public.records (id, data) values ($1, $2)`, [id, record()]);
    await as({ user: who }, `insert into public.listens (id, record_id, at, source) values ($1, $2, '2026-10-26T21:00:00+02:00', 'nfc')`, [`l-${id}`, id]);
  }
});

describe('sign-up', () => {
  it('creates a profile with a lowercase username and the default visibility', async () => {
    const rows = await as({ user: alice }, `select username, display_name, visibility from public.profiles where id = $1`, [alice]);
    expect(rows).toEqual([{ username: 'alice', display_name: 'Alice A.', visibility: 'public' }]);
    const [bobRow] = await as({ user: bob }, `select visibility from public.profiles where id = $1`, [bob]);
    expect(bobRow).toEqual({ visibility: 'members' });
  });

  it('rejects taken, reserved, malformed or missing usernames', async () => {
    await expect(signUp('ALICE')).rejects.toThrow(/unique/);
    await expect(signUp('admin')).rejects.toThrow(/username_not_reserved/);
    await expect(signUp('no spaces')).rejects.toThrow(/username_format/);
    await expect(signUp('ab')).rejects.toThrow(/username_format/);
    await exec('set role supabase_auth_admin;');
    await expect(db.query(`insert into auth.users (email) values ('x@example.com')`)).rejects.toThrow(/null value/);
    await exec('reset role;');
  });

  it('answers username availability for the sign-up form', async () => {
    const check = async (name: string) => (await as<{ ok: boolean }>('anon', `select public.username_available($1) as ok`, [name]))[0].ok;
    expect(await check('newbie')).toBe(true);
    expect(await check('alice')).toBe(false);
    expect(await check('admin')).toBe(false);
    expect(await check('Bad Name')).toBe(false);
  });
});

describe('who can see what', () => {
  const visibleUsers = async (who: Parameters<typeof as>[0]) =>
    (await as<{ username: string }>(who, `select username from public.profiles order by username`)).map((r) => r.username);

  it('signed-out visitors see only public listeners', async () => {
    expect(await visibleUsers('anon')).toEqual(['alice']);
    expect(await as('anon', `select id from public.records`)).toEqual([{ id: 'kind-of-blue' }]);
    expect(await as('anon', `select id from public.listens`)).toEqual([{ id: 'l-kind-of-blue' }]);
  });

  it('signed-in listeners also see members-only profiles, but never private ones', async () => {
    expect(await visibleUsers({ user: dave })).toEqual(['alice', 'bob', 'dave']);
    const records = await as<{ id: string }>({ user: dave }, `select id from public.records order by id`);
    expect(records.map((r) => r.id)).toEqual(['abbey-road', 'kind-of-blue']);
  });

  it('a private listener still sees their own crate', async () => {
    expect(await visibleUsers({ user: carol })).toContain('carol');
    expect(await as({ user: carol }, `select id from public.records where user_id = auth.uid()`)).toEqual([{ id: 'blue' }]);
  });

  it('the People directory follows the same rules', async () => {
    const anonDir = await as<{ username: string }>('anon', `select username from public.directory()`);
    expect(anonDir.map((r) => r.username)).toEqual(['alice']);
    const daveDir = await as<{ username: string; records: string; spins: string }>({ user: dave }, `select username, records, spins from public.directory() order by username`);
    expect(daveDir.map((r) => [r.username, Number(r.records), Number(r.spins)])).toEqual([
      ['alice', 1, 1],
      ['bob', 1, 1],
      ['dave', 0, 0],
    ]);
  });

  it('nobody can read emails or login data through the API roles', async () => {
    await expect(as({ user: dave }, `select email from auth.users`)).rejects.toThrow(/permission denied/);
    await expect(as({ user: dave }, `select * from private.login_failures`)).rejects.toThrow(/permission denied/);
    await expect(as('anon', `select public.begin_login('alice')`)).rejects.toThrow(/permission denied/);
    await expect(as({ user: dave }, `select public.begin_login('alice')`)).rejects.toThrow(/permission denied/);
    await expect(as({ user: dave }, `select public.finish_login('alice', true)`)).rejects.toThrow(/permission denied/);
  });
});

describe('who can change what', () => {
  it('you can only write your own crate', async () => {
    // The owner comes from your session; you can't even name another user_id.
    await expect(
      as({ user: dave }, `insert into public.records (user_id, id, data) values ($1, 'stolen', $2)`, [alice, record()]),
    ).rejects.toThrow(/permission denied/);
    expect(await as({ user: dave }, `update public.records set data = $1 where user_id = $2 returning id`, [record('Hacked'), alice])).toEqual([]);
    expect(await as({ user: dave }, `delete from public.listens where user_id = $1 returning id`, [alice])).toEqual([]);
    const [still] = await as<{ title: string }>('service', `select data ->> 'title' as title from public.records where user_id = $1`, [alice]);
    expect(still.title).toBe('Kind of Blue');
  });

  it('signed-out visitors cannot write anything', async () => {
    await expect(as('anon', `insert into public.listens (id, record_id, at) values ('lxxxx', 'kind-of-blue', '2026-10-26T21:00:00+02:00')`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(as('anon', `update public.profiles set visibility = 'private'`)).rejects.toThrow(/permission denied/);
  });

  it('you can edit your own profile, and only the allowed fields', async () => {
    expect(await as({ user: dave }, `update public.profiles set display_name = 'Dave' where id = $1 returning display_name`, [dave])).toEqual([
      { display_name: 'Dave' },
    ]);
    expect(await as({ user: dave }, `update public.profiles set display_name = 'Pwned' where id = $1 returning id`, [alice])).toEqual([]);
    await expect(as({ user: dave }, `update public.profiles set visibility = 'everyone' where id = $1`, [dave])).rejects.toThrow(/visibility_values/);
    await expect(as({ user: dave }, `update public.profiles set id = gen_random_uuid() where id = $1`, [dave])).rejects.toThrow(/permission denied/);
  });

  it('validates what goes into a crate', async () => {
    const add = (id: string, data: string) => as({ user: dave }, `insert into public.records (id, data) values ($1, $2)`, [id, data]);
    await expect(add('Bad Id', record())).rejects.toThrow(/record_id_format/);
    await expect(add('no-title', JSON.stringify({ artists: [] }))).rejects.toThrow(/record_data_title/);
    await expect(add('tracker', record('X', { coverUrl: 'https://evil.example/pixel.gif' }))).rejects.toThrow(/record_data_cover/);
    await add('caa', record('X', { coverUrl: 'https://coverartarchive.org/release-group/abc/front-500' }));
    await add('ia', record('Y', { coverUrl: 'https://ia800300.us.archive.org/1/items/x.jpg' }));
    await expect(
      as({ user: dave }, `insert into public.listens (id, record_id, at) values ('lyyyy', 'caa', '2026-10-26 21:00')`),
    ).rejects.toThrow(/listen_at_format/);
  });

  it('removing a record removes its spins', async () => {
    await as({ user: bob }, `delete from public.records where id = 'abbey-road'`);
    expect(await as({ user: bob }, `select id from public.listens where user_id = auth.uid()`)).toEqual([]);
  });

  it('deleting your account removes everything', async () => {
    await as({ user: bob }, `select public.delete_my_account()`);
    expect(await as('service', `select count(*)::int as n from public.listens where user_id = $1`, [bob])).toEqual([{ n: 0 }]);
    expect((await db.query(`select count(*)::int as n from auth.users where id = $1`, [bob])).rows).toEqual([{ n: 0 }]);
    await expect(as('anon', `select public.delete_my_account()`)).rejects.toThrow(/permission denied/);
  });
});

describe('username sign-in helpers', () => {
  it('turns a username into its email, for the server only', async () => {
    const [row] = await as<{ r: { allowed: boolean; email: string } }>('service', `select public.begin_login('ALICE') as r`);
    expect(row.r.allowed).toBe(true);
    expect(row.r.email).toMatch(/^alice-.*@example\.com$/);
    const [none] = await as<{ r: { allowed: boolean; email: string | null } }>('service', `select public.begin_login('ghost') as r`);
    expect(none.r).toEqual({ allowed: true, email: null });
  });

  it('locks a username for 15 minutes after 10 failed attempts', async () => {
    for (let i = 0; i < 10; i++) await as('service', `select public.finish_login('alice', false)`);
    const [locked] = await as<{ r: { allowed: boolean } }>('service', `select public.begin_login('alice') as r`);
    expect(locked.r).toEqual({ allowed: false });
    await as('service', `select public.finish_login('alice', true)`);
    const [open] = await as<{ r: { allowed: boolean } }>('service', `select public.begin_login('alice') as r`);
    expect(open.r.allowed).toBe(true);
  });
});
