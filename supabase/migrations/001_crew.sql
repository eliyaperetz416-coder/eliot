-- Demigod crew: the database as it runs in the Supabase project "demigod" (kept here for transparency and for rebuilding it).
-- Nothing is reachable directly: row level security is on with no policies. The app only calls the functions below, and every
-- function needs the member's secret token (it stays on the phone; only its sha256 hash is stored).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  nickname text not null check (char_length(nickname) between 1 and 24),
  stats jsonb not null default '{}'::jsonb,
  stats_updated_at timestamptz,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_post_at timestamptz,
  active boolean not null default true
);
create unique index members_nick_per_group on public.members (group_id, lower(nickname));
create index members_group on public.members (group_id);
create table public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  nickname text not null,
  kind text not null check (kind in ('chat', 'status', 'system')),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index messages_group_id_desc on public.messages (group_id, id desc);
create table public.push_subs (
  member_id uuid primary key references public.members(id) on delete cascade,
  sub jsonb not null,
  updated_at timestamptz not null default now(),
  enabled boolean not null default true
);
create table public.app_config (key text primary key, value text not null); -- notify_secret, vapid_public, vapid_private
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.messages enable row level security;
alter table public.push_subs enable row level security;
alter table public.app_config enable row level security;
revoke all on public.groups, public.members, public.messages, public.push_subs, public.app_config from anon, authenticated;
insert into public.app_config (key, value) values ('notify_secret', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- Functions (final state, dumped from the running database).
create or replace function app_private.clean_nick(p text) returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), 24)
$$;

create or replace function app_private.member_of(p_token text) returns public.members language plpgsql security definer set search_path = public, extensions as $$
declare m public.members;
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  select * into m from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'not_member'; end if;
  return m;
end $$;

create or replace function app_private.on_message_notify() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  if new.kind in ('chat', 'status') then
    begin
      select value into s from public.app_config where key = 'notify_secret';
      perform net.http_post(
        url := 'https://szhdasydkoqtbmbrmzpi.supabase.co/functions/v1/notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
        body := jsonb_build_object('message_id', new.id));
    exception when others then null; -- a failed push must never block a message
    end;
  end if;
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function app_private.on_message_notify();

create or replace function public.create_group(p_name text, p_nick text, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.groups; m public.members; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; nick text := app_private.clean_nick(p_nick); gname text := left(trim(coalesce(p_name, '')), 40);
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  if nick = '' then raise exception 'bad_nick'; end if;
  if gname = '' then raise exception 'bad_name'; end if;
  if exists (select 1 from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then raise exception 'already_member'; end if;
  if (select count(*) from public.groups) >= 200 then raise exception 'server_full'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (code, name) values (c, gname) returning * into g;
  insert into public.members (group_id, token_hash, nickname) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'created');
  return jsonb_build_object('code', g.code, 'name', g.name, 'member_id', m.id);
end $$;

create or replace function public.join_group(p_code text, p_nick text, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.groups; m public.members; nick text := app_private.clean_nick(p_nick);
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  if nick = '' then raise exception 'bad_nick'; end if;
  if exists (select 1 from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then raise exception 'already_member'; end if;
  select * into g from public.groups where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'no_group'; end if;
  if (select count(*) from public.members where group_id = g.id and active) >= 8 then raise exception 'group_full'; end if;
  if exists (select 1 from public.members where group_id = g.id and lower(nickname) = lower(nick)) then raise exception 'nick_taken'; end if;
  insert into public.members (group_id, token_hash, nickname) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'joined');
  return jsonb_build_object('code', g.code, 'name', g.name, 'member_id', m.id);
end $$;

create or replace function public.my_group(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; g public.groups;
begin
  m := app_private.member_of(p_token);
  update public.members set last_seen_at = now() where id = m.id;
  select * into g from public.groups where id = m.group_id;
  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'code', g.code),
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $$;

create or replace function public.update_stats(p_token text, p_stats jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; clean jsonb := '{}'::jsonb; k text; v numeric;
begin
  m := app_private.member_of(p_token);
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then raise exception 'bad_stats'; end if;
  foreach k in array array['rating', 'level', 'streak', 'weekVolume', 'monthWorkouts', 'workouts', 'tierIndex'] loop
    if p_stats ? k and jsonb_typeof(p_stats -> k) = 'number' then
      v := (p_stats ->> k)::numeric;
      if v between 0 and 100000000 then clean := clean || jsonb_build_object(k, round(v)); end if;
    end if;
  end loop;
  if p_stats ? 'tier' and jsonb_typeof(p_stats -> 'tier') = 'string' then clean := clean || jsonb_build_object('tier', left(p_stats ->> 'tier', 20)); end if;
  if p_stats ? 'division' and jsonb_typeof(p_stats -> 'division') = 'string' then clean := clean || jsonb_build_object('division', left(p_stats ->> 'division', 4)); end if;
  update public.members set stats = clean, stats_updated_at = now() where id = m.id;
end $$;

create or replace function public.post_message(p_token text, p_kind text, p_body text) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; body text := left(trim(coalesce(p_body, '')), 280); new_id bigint; cutoff bigint;
begin
  m := app_private.member_of(p_token);
  if p_kind not in ('chat', 'status') then raise exception 'bad_kind'; end if;
  if body = '' then raise exception 'empty'; end if;
  if m.last_post_at is not null and m.last_post_at > now() - interval '1500 milliseconds' then raise exception 'too_fast'; end if;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, m.nickname, p_kind, body) returning id into new_id;
  update public.members set last_post_at = now() where id = m.id;
  select id into cutoff from public.messages where group_id = m.group_id order by id desc offset 500 limit 1;
  if cutoff is not null then delete from public.messages where group_id = m.group_id and id <= cutoff; end if;
  return new_id;
end $$;

create or replace function public.get_messages(p_token text, p_after bigint default 0, p_limit int default 60) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; lim int := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  m := app_private.member_of(p_token);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id, member_id, nickname, kind, body, created_at from public.messages
      where group_id = m.group_id and id > coalesce(p_after, 0) order by id desc limit lim) r), '[]'::jsonb);
end $$;

-- Leaving is a soft delete: the seat and the nickname are freed, the token stops working.
create or replace function public.leave_group(p_token text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members;
begin
  m := app_private.member_of(p_token);
  update public.members set active = false, token_hash = 'left:' || id::text, nickname = left(nickname, 15) || '~' || substr(id::text, 1, 6) where id = m.id;
  update public.push_subs set enabled = false where member_id = m.id;
end $$;

create or replace function public.save_push(p_token text, p_sub jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members;
begin
  m := app_private.member_of(p_token);
  if p_sub is null or jsonb_typeof(p_sub) <> 'object' or not (p_sub ? 'endpoint') or length(p_sub::text) > 2000 then raise exception 'bad_sub'; end if;
  insert into public.push_subs (member_id, sub, enabled) values (m.id, p_sub, true) on conflict (member_id) do update set sub = excluded.sub, enabled = true, updated_at = now();
end $$;

create or replace function public.delete_push(p_token text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members;
begin
  m := app_private.member_of(p_token);
  update public.push_subs set enabled = false where member_id = m.id;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function public.create_group(text, text, text), public.join_group(text, text, text), public.my_group(text), public.update_stats(text, jsonb),
  public.post_message(text, text, text), public.get_messages(text, bigint, int), public.leave_group(text), public.save_push(text, jsonb), public.delete_push(text) to anon;
