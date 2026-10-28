-- VinylWrapped database: accounts (profiles), each user's crate (records) and spins (listens).
--
-- Security model
--   * Passwords never touch these tables. Supabase Auth stores them (bcrypt-hashed) in auth.users.
--   * Emails stay in auth.users as well, which the public API never exposes. The only way to turn a
--     username into an email is begin_login(), and only the server-side login function may call it.
--   * Row Level Security is on for every table. You can only write your own rows, and you can read
--     another listener's crate only if their profile's visibility allows it:
--       public  → anyone with the link, even signed out
--       members → anyone signed in (the default)
--       private → only you
--   * Every SECURITY DEFINER function pins search_path and has EXECUTE granted explicitly.

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------

create function public.is_reserved_username(name text) returns boolean
language sql immutable set search_path = ''
as $$
  select name = any (array[
    'admin', 'administrator', 'root', 'support', 'help', 'api', 'me', 'you', 'settings', 'people',
    'login', 'signup', 'demo', 'vinylwrapped', 'official', 'moderator', 'system', 'null', 'undefined'
  ]);
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
    constraint username_not_reserved check (not public.is_reserved_username(username)),
  display_name text
    constraint display_name_length check (char_length(display_name) between 1 and 50),
  visibility text not null default 'members'
    constraint visibility_values check (visibility in ('public', 'members', 'private')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per account. Usernames are public handles; emails live only in auth.users.';

-- Creates the profile when someone signs up. Sign-up fails if the username is missing, invalid or taken.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data ->> 'username')),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Whether the signed-in user (or an anonymous visitor) may see this listener's profile and crate.
create function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = owner
      and (
        p.id = auth.uid()
        or p.visibility = 'public'
        or (p.visibility = 'members' and auth.uid() is not null)
      )
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Crates and spins
-- ---------------------------------------------------------------------------------------------

create table public.records (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The id written on the record's NFC tag (…/#/spin/<id>).
  id text not null
    constraint record_id_format check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  -- Title, artists, genres, tracklist… (the VinylRecord fields), filled in from MusicBrainz.
  data jsonb not null
    constraint record_data_object check (jsonb_typeof(data) = 'object')
    constraint record_data_size check (pg_column_size(data) <= 65536)
    constraint record_data_title check (coalesce(char_length(data ->> 'title'), 0) between 1 and 300)
    -- Covers are shown to other listeners, so only allow the archives we fetch them from
    -- (an arbitrary image URL would let a profile track whoever views it).
    constraint record_data_cover check (
      data ->> 'coverUrl' is null
      or data ->> 'coverUrl' ~ '^https://(coverartarchive\.org|([a-z0-9-]+\.)*archive\.org|i\.discogs\.com)/'
    ),
  added_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.listens (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id text not null
    constraint listen_id_format check (id ~ '^[A-Za-z0-9_-]{4,40}$'),
  -- May point at a tag that isn't linked to a record yet.
  record_id text not null
    constraint listen_record_format check (record_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  -- Local wall-clock time with its UTC offset, e.g. 2026-10-26T21:14:03+02:00.
  at text not null
    constraint listen_at_format check (at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$'),
  source text not null default 'web'
    constraint listen_source check (source in ('nfc', 'shortcut', 'web', 'manual')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index listens_user_record_idx on public.listens (user_id, record_id);

-- Keep one account from filling the free database.
create function public.enforce_quota() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'records'
     and (select count(*) from public.records where user_id = new.user_id) >= 5000 then
    raise exception 'A crate can hold at most 5,000 records.' using errcode = 'check_violation';
  elsif tg_table_name = 'listens'
     and (select count(*) from public.listens where user_id = new.user_id) >= 100000 then
    raise exception 'An account can log at most 100,000 spins.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger records_quota before insert on public.records
  for each row execute function public.enforce_quota();
create trigger listens_quota before insert on public.listens
  for each row execute function public.enforce_quota();

-- Removing a record from your crate also removes its spins. Runs as the caller, so RLS still applies.
create function public.delete_record_listens() returns trigger
language plpgsql set search_path = ''
as $$
begin
  delete from public.listens where user_id = old.user_id and record_id = old.id;
  return old;
end;
$$;

create trigger records_delete_listens after delete on public.records
  for each row execute function public.delete_record_listens();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.listens enable row level security;

create policy "Profiles are visible according to their visibility"
  on public.profiles for select to anon, authenticated
  using (public.can_view(id));

create policy "You can edit your own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Crates are visible according to the owner's visibility"
  on public.records for select to anon, authenticated
  using (public.can_view(user_id));

create policy "You can add records to your own crate"
  on public.records for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "You can edit records in your own crate"
  on public.records for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "You can remove records from your own crate"
  on public.records for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Spins are visible according to the owner's visibility"
  on public.listens for select to anon, authenticated
  using (public.can_view(user_id));

create policy "You can log your own spins"
  on public.listens for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "You can edit your own spins"
  on public.listens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "You can delete your own spins"
  on public.listens for delete to authenticated
  using (user_id = (select auth.uid()));

-- Table privileges: start from nothing, then grant exactly what the app needs.
revoke all on public.profiles, public.records, public.listens from anon, authenticated;
grant select on public.profiles, public.records, public.listens to anon, authenticated;
grant update (username, display_name, visibility) on public.profiles to authenticated;
grant insert (id, data), update (id, data), delete on public.records to authenticated;
grant insert (id, record_id, at, source), update (record_id, at, source), delete on public.listens to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------

-- Sign-up form: is this username free?
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select name ~ '^[a-z0-9_]{3,20}$'
     and not public.is_reserved_username(name)
     and not exists (select 1 from public.profiles where username = name);
$$;

-- The People page: listeners you're allowed to see, with a few totals. SECURITY INVOKER, so the
-- row level security above decides who appears and what gets counted.
create function public.directory()
returns table (username text, display_name text, visibility text, records bigint, spins bigint, last_spin text, joined timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select
    p.username,
    p.display_name,
    p.visibility,
    (select count(*) from public.records r where r.user_id = p.id),
    (select count(*) from public.listens l where l.user_id = p.id),
    (select max(l.at) from public.listens l where l.user_id = p.id),
    p.created_at
  from public.profiles p
  order by 6 desc nulls last, p.created_at;
$$;

-- Settings › Delete my account. Cascades to the profile, records and spins.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Username sign-in (used only by the auth-login Edge Function, with the secret key)
-- ---------------------------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;

-- Failed sign-in attempts per username, for throttling password guessing. Not reachable through the API.
create table private.login_failures (
  username text not null,
  failed_at timestamptz not null default now()
);
create index login_failures_username_idx on private.login_failures (username, failed_at);

-- Returns {"allowed": false} while a username is locked out (10 failures in 15 minutes),
-- otherwise {"allowed": true, "email": <email or null>}.
create function public.begin_login(p_username text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  recent int;
  found_email text;
begin
  select count(*) into recent
  from private.login_failures
  where username = lower(p_username) and failed_at > now() - interval '15 minutes';

  if recent >= 10 then
    return jsonb_build_object('allowed', false);
  end if;

  select u.email into found_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(p_username);

  return jsonb_build_object('allowed', true, 'email', found_email);
end;
$$;

create function public.finish_login(p_username text, p_success boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_success then
    delete from private.login_failures where username = lower(p_username);
  else
    insert into private.login_failures (username) values (lower(p_username));
  end if;
  delete from private.login_failures where failed_at < now() - interval '1 day';
end;
$$;

-- Function privileges: Postgres lets everyone execute new functions by default (and Supabase adds
-- explicit grants), so revoke everything and grant back only what each caller needs.
revoke execute on function
  public.is_reserved_username(text),
  public.handle_new_user(),
  public.can_view(uuid),
  public.enforce_quota(),
  public.delete_record_listens(),
  public.username_available(text),
  public.directory(),
  public.delete_my_account(),
  public.begin_login(text),
  public.finish_login(text, boolean)
from public, anon, authenticated;

grant execute on function public.is_reserved_username(text) to anon, authenticated;
grant execute on function public.can_view(uuid) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.directory() to anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.begin_login(text), public.finish_login(text, boolean) to service_role;
