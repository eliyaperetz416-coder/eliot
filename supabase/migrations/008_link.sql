-- Demigod -> Habit Coach link: a read-only summary of your training that your other app (Habit Coach) can fetch.
-- Same rules as the crew: the table is closed (row level security on, no policies), the apps can only call the functions below,
-- and every call needs the secret link token. The token stays on your phones; only its sha256 hash is stored.
-- "Disconnect" is a soft delete (active = false, snapshot emptied): the Supabase tool times out on DELETE inside function bodies.

create table if not exists public.link_snapshots (
  token_hash text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  put_count int not null default 0,
  window_start timestamptz not null default now(),
  active boolean not null default true
);
alter table public.link_snapshots enable row level security;
revoke all on public.link_snapshots from anon, authenticated;

create or replace function app_private.link_hash(p_token text) returns text language plpgsql stable set search_path = public, extensions as $$
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then raise exception 'bad_token'; end if;
  return encode(extensions.digest(p_token, 'sha256'), 'hex');
end $$;

-- Upload (or replace) the summary. At most 24 KB, 60 updates an hour per link, 500 links in total (it is a personal app).
create or replace function public.link_put(p_token text, p_snapshot jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare h text := app_private.link_hash(p_token); r public.link_snapshots;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'bad_snapshot'; end if;
  if octet_length(p_snapshot::text) > 24576 then raise exception 'too_large'; end if;
  select * into r from public.link_snapshots where token_hash = h for update;
  if not found then
    if (select count(*) from public.link_snapshots where active) >= 500 then raise exception 'full'; end if;
    insert into public.link_snapshots (token_hash, snapshot) values (h, p_snapshot);
    return;
  end if;
  if r.window_start < now() - interval '1 hour' then
    r.window_start := now();
    r.put_count := 0;
  end if;
  if r.put_count >= 60 then raise exception 'too_fast'; end if;
  update public.link_snapshots
    set snapshot = p_snapshot, updated_at = now(), put_count = r.put_count + 1, window_start = r.window_start, active = true
    where token_hash = h;
end $$;

-- Read the summary: { snapshot, updated_at }, or null when the link does not exist or was disconnected.
create or replace function public.link_get(p_token text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare r public.link_snapshots;
begin
  select * into r from public.link_snapshots where token_hash = app_private.link_hash(p_token) and active;
  if not found then return null; end if;
  return jsonb_build_object('snapshot', r.snapshot, 'updated_at', r.updated_at);
end $$;

-- Disconnect: the summary is emptied and can no longer be read.
create or replace function public.link_revoke(p_token text) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.link_snapshots set active = false, snapshot = '{}'::jsonb, updated_at = now() where token_hash = app_private.link_hash(p_token);
end $$;

revoke execute on function app_private.link_hash(text), public.link_put(text, jsonb), public.link_get(text), public.link_revoke(text) from public, anon, authenticated;
grant execute on function public.link_put(text, jsonb), public.link_get(text), public.link_revoke(text) to anon;
