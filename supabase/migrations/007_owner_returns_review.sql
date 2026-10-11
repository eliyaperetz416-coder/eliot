-- v1.31 (OUR DESIGN, asked by Elia):
--  * only the owner can open crews: create_group needs the owner key. The key is made here on the server, never printed, and handed only to the owner's member (Eliya) by my_group; his phone keeps it.
--  * shop returns: 2 per calendar month (Israel time) for crew members, counted on the server (record_return)
--  * leader punishments and gifts have no limits: no cap on suspension length (up to years), rating drop or gift size; every one has an announce switch
--  * before a gift the leader can look at the member's progress: a daily history (rating, weekly volume, workouts) and the latest heavy sets (get_member_review, leader only; the sets are never in my_group)

-- part A: tables and owner key
insert into public.app_config (key, value) values ('owner_key', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;
insert into public.app_config (key, value) values ('owner_member', '69235706-2dda-4395-b74c-0b8b8135f820') on conflict (key) do nothing;
alter table public.members add column if not exists recent jsonb not null default '[]'::jsonb;
alter table public.crew_gifts drop constraint if exists crew_gifts_amount_check;
alter table public.crew_gifts add constraint crew_gifts_amount_check check (amount between 1 and 10000000);
create table if not exists public.crew_returns (id bigint generated always as identity primary key, member_id uuid not null references public.members(id) on delete cascade, at timestamptz not null default now());
create table if not exists public.member_history (
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  rating int, week_volume int, month_workouts int, workouts int, streak int, level int,
  primary key (member_id, day)
);
alter table public.crew_returns enable row level security;
alter table public.member_history enable row level security;
revoke all on public.crew_returns, public.member_history from anon, authenticated;

-- part B: create_group (owner only), my_group (owner key for the owner, returns used this month), record_return
create or replace function public.create_group(p_name text, p_nick text, p_token text, p_owner_key text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.groups; m public.members; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; nick text := app_private.clean_nick(p_nick); gname text := left(trim(coalesce(p_name, '')), 40);
begin
  if p_owner_key is null or p_owner_key <> (select value from public.app_config where key = 'owner_key') then raise exception 'not_owner'; end if;
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
  insert into public.members (group_id, token_hash, nickname, is_leader) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick, true) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'created');
  return jsonb_build_object('code', g.code, 'name', g.name, 'member_id', m.id);
end $$;

create or replace function public.my_group(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; g public.groups; own boolean; used int;
begin
  m := app_private.member_of(p_token);
  update public.members set last_seen_at = now() where id = m.id;
  select * into g from public.groups where id = m.group_id;
  own := m.id::text = (select value from public.app_config where key = 'owner_member');
  select count(*)::int into used from public.crew_returns where member_id = m.id and at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem';
  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'code', g.code),
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname, 'leader', m.is_leader, 'suspended_until', case when m.suspended_until > now() then m.suspended_until else null end, 'adjust', m.adjust, 'returns_used', used,
      'owner_key', case when own then (select value from public.app_config where key = 'owner_key') else null end),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at, 'plan', x.plan, 'leader', x.is_leader, 'adjust', x.adjust, 'suspended_until', case when x.suspended_until > now() then x.suspended_until else null end) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $$;

create or replace function public.record_return(p_token text) returns int language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; used int;
begin
  m := app_private.member_of(p_token);
  select count(*)::int into used from public.crew_returns where member_id = m.id and at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem';
  if used >= 2 then raise exception 'return_limit'; end if;
  insert into public.crew_returns (member_id) values (m.id);
  return used + 1;
end $$;

-- part C: leader powers without limits, each with an announce switch
create or replace function public.suspend_member(p_token text, p_member_id uuid, p_hours int, p_announce boolean default true) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members; h int := coalesce(p_hours, 0);
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if h < 0 or h > 876000 then raise exception 'bad_target'; end if;
  update public.members set suspended_until = case when h = 0 then null else now() + make_interval(hours => h) end where id = t.id;
  if coalesce(p_announce, true) then insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', case when h = 0 then 'unsuspended' else 'suspended:' || h end); end if;
end $$;

create or replace function public.set_adjust(p_token text, p_member_id uuid, p_value int, p_announce boolean default true) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members; v int := coalesce(p_value, 0);
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if v > 0 or v < -100000 then raise exception 'bad_target'; end if;
  update public.members set adjust = v where id = t.id;
  if coalesce(p_announce, true) then insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'adjust:' || v); end if;
end $$;

create or replace function public.give_drachmas(p_token text, p_member_id uuid, p_amount int, p_announce boolean default true) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then raise exception 'bad_target'; end if;
  insert into public.crew_gifts (member_id, amount) values (t.id, p_amount);
  if coalesce(p_announce, true) then insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'gift:' || p_amount); end if;
end $$;

create or replace function public.kick_member(p_token text, p_member_id uuid, p_announce boolean default true) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  update public.members set active = false, is_leader = false, token_hash = 'left:' || id::text, nickname = left(nickname, 15) || '~' || substr(id::text, 1, 6) where id = t.id;
  update public.push_subs set enabled = false where member_id = t.id;
  if coalesce(p_announce, true) then insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'removed'); end if;
end $$;

create or replace function public.make_leader(p_token text, p_member_id uuid, p_announce boolean default true) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  update public.members set is_leader = (id = t.id) where id in (m.id, t.id);
  if coalesce(p_announce, true) then insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, t.id, t.nickname, 'system', 'leader'); end if;
end $$;

-- part D: daily history and latest heavy sets, only the leader can read them
create or replace function public.update_stats(p_token text, p_stats jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; clean jsonb := '{}'::jsonb; k text; v numeric; rec jsonb := null; x jsonb; one jsonb; n int := 0;
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
  if p_stats ? 'recent' and jsonb_typeof(p_stats -> 'recent') = 'array' then
    rec := '[]'::jsonb;
    for x in select value from jsonb_array_elements(p_stats -> 'recent') loop
      exit when n >= 8;
      if jsonb_typeof(x) = 'object' and jsonb_typeof(x -> 'w') = 'number' and jsonb_typeof(x -> 'r') = 'number' and jsonb_typeof(x -> 'e') = 'string' and jsonb_typeof(x -> 'd') = 'string' then
        one := jsonb_build_object('e', left(x ->> 'e', 60), 'n', left(coalesce(x ->> 'n', ''), 60), 'w', round((x ->> 'w')::numeric, 1), 'r', round((x ->> 'r')::numeric), 'd', left(x ->> 'd', 10));
        rec := rec || one; n := n + 1;
      end if;
    end loop;
  end if;
  update public.members set stats = clean, stats_updated_at = now(), recent = coalesce(rec, recent) where id = m.id;
  insert into public.member_history (member_id, day, rating, week_volume, month_workouts, workouts, streak, level)
  values (m.id, (now() at time zone 'Asia/Jerusalem')::date, (clean ->> 'rating')::int, (clean ->> 'weekVolume')::int, (clean ->> 'monthWorkouts')::int, (clean ->> 'workouts')::int, (clean ->> 'streak')::int, (clean ->> 'level')::int)
  on conflict (member_id, day) do update set rating = excluded.rating, week_volume = excluded.week_volume, month_workouts = excluded.month_workouts, workouts = excluded.workouts, streak = excluded.streak, level = excluded.level;
end $$;

create or replace function public.get_member_review(p_token text, p_member_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found then raise exception 'bad_target'; end if;
  return jsonb_build_object('nickname', t.nickname, 'recent', t.recent, 'updated', t.stats_updated_at,
    'history', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'rating', h.rating, 'week', h.week_volume, 'month', h.month_workouts, 'workouts', h.workouts, 'streak', h.streak, 'level', h.level) order by h.day) from (select * from public.member_history where member_id = t.id order by day desc limit 120) h), '[]'::jsonb));
end $$;

grant execute on function public.create_group(text, text, text, text), public.record_return(text), public.suspend_member(text, uuid, int, boolean), public.set_adjust(text, uuid, int, boolean),
  public.give_drachmas(text, uuid, int, boolean), public.kick_member(text, uuid, boolean), public.make_leader(text, uuid, boolean), public.get_member_review(text, uuid), public.update_stats(text, jsonb), public.my_group(text) to anon;

-- the old 3-argument create_group stays (dropping it hangs on this server) but can no longer create anything
create or replace function public.create_group(p_name text, p_nick text, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  raise exception 'not_owner';
end $$;
