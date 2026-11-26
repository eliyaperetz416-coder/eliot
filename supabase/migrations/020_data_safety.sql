-- Data safety (Elia, 26.11, after the three simulations). Additive: new tables in app_private (never reachable by the app),
-- new triggers, replaced function bodies. No row of anyone's data is removed by this migration.
--  * A1  every save keeps the version it replaced: the last 3 versions plus the last version of each of the past 7 days
--        (a bad app version, a mistake or an intruder that writes over the data can be undone).
--  * A3  one person's data may be at most 1 MB (it is about 3 KB today) and at most 600 saves an hour.
--  * A12 deleting the account needs a Google sign-in from the last 15 minutes ('reauth' otherwise), and keeps a copy
--        for 24 hours (then it is erased by the daily clean-up, migration 021), so a stolen phone cannot erase it for good.
--  * A8  the old Habit Coach link functions answer 'removed'; the two snapshots left there are emptied.
--  * A9  the old owner key is no longer handed to anyone and its value is blanked.

-- A1 ---------------------------------------------------------------------------------------------------------------
create table if not exists app_private.user_data_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  version bigint not null,
  data jsonb not null,
  app_version text,
  saved_at timestamptz not null default now()
);
create index if not exists user_data_history_user on app_private.user_data_history (user_id, id desc);
revoke all on app_private.user_data_history from public, anon, authenticated;

create or replace function app_private.user_data_keep() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.data is not distinct from new.data then return null; end if;
  insert into app_private.user_data_history (user_id, version, data, app_version) values (old.user_id, old.version, old.data, old.app_version);
  delete from app_private.user_data_history h
  where h.user_id = old.user_id
    and h.id not in (select x.id from app_private.user_data_history x where x.user_id = old.user_id order by x.id desc limit 3)
    and h.id not in (select max(x.id) from app_private.user_data_history x
                     where x.user_id = old.user_id and x.saved_at > now() - interval '7 days'
                     group by (x.saved_at at time zone 'Asia/Jerusalem')::date);
  return null;
end $$;
revoke all on function app_private.user_data_keep() from public, anon, authenticated;
drop trigger if exists user_data_keep on public.user_data;
create trigger user_data_keep after update on public.user_data for each row execute function app_private.user_data_keep();

-- A3 ---------------------------------------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_data_size_1mb') then
    alter table public.user_data add constraint user_data_size_1mb check (octet_length(data::text) <= 1000000) not valid;
    alter table public.user_data validate constraint user_data_size_1mb;
  end if;
end $$;

create or replace function app_private.user_data_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_hit(coalesce(old.user_id, new.user_id), 'user_data', 600, interval '1 hour');
  new.updated_at := now();
  new.version := case when tg_op = 'INSERT' then 1 else old.version + 1 end;
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  return new;
end $$;
revoke all on function app_private.user_data_stamp() from public, anon, authenticated;

-- A12 --------------------------------------------------------------------------------------------------------------
create table if not exists app_private.deleted_accounts (
  user_id uuid primary key,
  email text,
  data jsonb,
  deleted_at timestamptz not null default now()
);
revoke all on app_private.deleted_accounts from public, anon, authenticated;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); signed bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- when did this person last sign in with Google (not a silent token refresh)? amr keeps that moment
  select max((x ->> 'timestamp')::bigint) into signed
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x;
  if signed is null or signed < extract(epoch from now()) - 900 then raise exception 'reauth'; end if;
  insert into app_private.deleted_accounts (user_id, email, data)
    select u.id, u.email, d.data from auth.users u left join public.user_data d on d.user_id = u.id where u.id = uid
  on conflict (user_id) do update set email = excluded.email, data = excluded.data, deleted_at = now();
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- A8 ---------------------------------------------------------------------------------------------------------------
create or replace function public.link_get(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin raise exception 'removed'; end $$;
create or replace function public.link_put(p_token text, p_snapshot jsonb) returns void
language plpgsql security definer set search_path = '' as $$ begin raise exception 'removed'; end $$;
update public.link_snapshots set snapshot = '{}'::jsonb, active = false where snapshot <> '{}'::jsonb or active;

-- A9 ---------------------------------------------------------------------------------------------------------------
create or replace function public.my_group(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare m public.members; g public.groups; used int;
begin
  m := app_private.member_of(p_token);
  perform app_private.rate_hit(m.id, 'my_group', 60, interval '1 minute');
  update public.members set last_seen_at = now() where id = m.id;
  select * into g from public.groups where id = m.group_id;
  select count(*)::int into used from public.crew_returns where member_id = m.id and at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem';
  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'code', g.code),
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname, 'leader', m.is_leader, 'suspended_until', null, 'adjust', 0, 'returns_used', used, 'owner_key', null),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at, 'plan', x.plan, 'leader', x.is_leader, 'adjust', 0, 'suspended_until', null) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $function$;
update public.app_config set value = '' where key in ('owner_key', 'owner_member') and value <> '';
