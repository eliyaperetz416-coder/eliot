-- 013: accounts (OUR DESIGN, spec docs/superpowers/specs/2026-11-22-redesign-accounts-design.md section 4).
-- Additive only: nothing the crew functions or the notify function use is changed.
--  * user_data: one row per signed-in user with the whole backup snapshot (same format as the backup file, plus the crew spot)
--  * user_push: the phone's Web Push subscription for the rest alarm
--  * rest_alarms: one pending "rest is over" reminder per user; pg_cron hands due rows to the rest-push edge function every 5 s
--  * delete_my_account(): the signed-in user deletes themselves (cascades to the three tables)

create table if not exists public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  schema_version int not null default 1,
  app_version text,
  updated_at timestamptz not null default now(),
  consent_at timestamptz,
  consent_version text,
  constraint user_data_size check (octet_length(data::text) <= 8000000)
);

create table if not exists public.user_push (
  user_id uuid primary key references auth.users on delete cascade,
  sub jsonb not null,
  rest_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.rest_alarms (
  user_id uuid primary key references auth.users on delete cascade,
  fire_at timestamptz not null,
  title text not null check (length(title) <= 80),
  body text not null check (length(body) <= 160)
);

alter table public.user_data enable row level security;
alter table public.user_push enable row level security;
alter table public.rest_alarms enable row level security;

revoke all on public.user_data, public.user_push, public.rest_alarms from anon, public;
grant select, insert, update on public.user_data to authenticated;
grant select, insert, update, delete on public.user_push, public.rest_alarms to authenticated;

drop policy if exists user_data_own_select on public.user_data;
drop policy if exists user_data_own_insert on public.user_data;
drop policy if exists user_data_own_update on public.user_data;
create policy user_data_own_select on public.user_data for select to authenticated using (user_id = (select auth.uid()));
create policy user_data_own_insert on public.user_data for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_data_own_update on public.user_data for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists user_push_own on public.user_push;
create policy user_push_own on public.user_push for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists rest_alarms_own on public.rest_alarms;
create policy rest_alarms_own on public.rest_alarms for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A reminder must be in the next hour (a rest timer is never longer).
create or replace function app_private.check_rest_alarm() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.fire_at < now() - interval '5 seconds' or new.fire_at > now() + interval '1 hour' then raise exception 'bad_fire_at'; end if;
  return new;
end $$;
revoke all on function app_private.check_rest_alarm() from public, anon, authenticated;
drop trigger if exists rest_alarms_check on public.rest_alarms;
create trigger rest_alarms_check before insert or update on public.rest_alarms for each row execute function app_private.check_rest_alarm();

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Hands every due reminder (with an enabled push subscription) to the rest-push edge function in one request.
create or replace function app_private.fire_rest_alarms() returns void
language plpgsql security definer set search_path = '' as $$
declare items jsonb; s text;
begin
  with due as (delete from public.rest_alarms where fire_at <= now() returning user_id, title, body)
  select jsonb_agg(jsonb_build_object('sub', p.sub, 'title', d.title, 'body', d.body)) into items
  from due d join public.user_push p on p.user_id = d.user_id and p.rest_enabled;
  if items is null then return; end if;
  select value into s from public.app_config where key = 'notify_secret';
  perform net.http_post(
    url := 'https://szhdasydkoqtbmbrmzpi.supabase.co/functions/v1/rest-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    body := jsonb_build_object('alarms', items));
end $$;
revoke all on function app_private.fire_rest_alarms() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'demigod-rest-alarms') then perform cron.unschedule('demigod-rest-alarms'); end if;
  perform cron.schedule('demigod-rest-alarms', '5 seconds', 'select app_private.fire_rest_alarms()');
end $$;
