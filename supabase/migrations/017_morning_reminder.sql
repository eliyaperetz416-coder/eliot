-- The morning reminder (Elia, 25.11): every morning at the time the person chose, a notification with today's plan.
-- The phone writes seven ready messages (one per weekday, 0 = Sunday, in the app's language) next to its push address,
-- with the minute of the day and its time zone. Every 5 minutes the server sends today's message to whoever is due and
-- marks the local date, so it goes out once a day, within the first hour after the chosen time (never late at night).
-- Additive: new columns with defaults, a new function and a new cron job. The rest alarm is untouched.
alter table public.user_push
  add column if not exists morning_on boolean not null default true,
  add column if not exists morning_minute integer not null default 480,
  add column if not exists tz text not null default 'Asia/Jerusalem',
  add column if not exists morning_msgs jsonb,
  add column if not exists morning_sent date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_push_morning_ok') then
    alter table public.user_push add constraint user_push_morning_ok check (
      morning_minute between 0 and 1439 and char_length(tz) <= 64
      and (morning_msgs is null or (jsonb_typeof(morning_msgs) = 'array' and jsonb_array_length(morning_msgs) = 7 and pg_column_size(morning_msgs) < 6000)));
  end if;
end $$;

-- a time zone the phone sent that the server does not know falls back to Israel (a bad value must never stop the job)
create or replace function app_private.safe_tz(p text) returns text
language sql stable set search_path = '' as $$
  select case when exists (select 1 from pg_catalog.pg_timezone_names where name = p) then p else 'Asia/Jerusalem' end
$$;
revoke all on function app_private.safe_tz(text) from public, anon, authenticated;

create or replace function app_private.fire_morning() returns void
language plpgsql security definer set search_path = '' as $$
declare items jsonb; s text;
begin
  with cand as (
    select p.user_id, (now() at time zone app_private.safe_tz(p.tz)) as lt from public.user_push p
    where p.morning_on and p.morning_msgs is not null
  ), due as (
    update public.user_push u set morning_sent = c.lt::date
    from cand c
    where u.user_id = c.user_id
      and (u.morning_sent is null or u.morning_sent < c.lt::date)
      and (extract(hour from c.lt) * 60 + extract(minute from c.lt)) between u.morning_minute and u.morning_minute + 59
    returning u.sub, u.morning_msgs -> (extract(dow from c.lt)::int) as msg
  )
  select jsonb_agg(jsonb_build_object('sub', sub, 'title', left(msg ->> 'title', 120), 'body', left(msg ->> 'body', 160))) into items
  from due where msg ->> 'title' is not null;
  if items is null then return; end if;
  select value into s from public.app_config where key = 'notify_secret';
  perform net.http_post(
    url := 'https://szhdasydkoqtbmbrmzpi.supabase.co/functions/v1/rest-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    body := jsonb_build_object('alarms', items));
end $$;
revoke all on function app_private.fire_morning() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'demigod-morning') then perform cron.unschedule('demigod-morning'); end if;
  perform cron.schedule('demigod-morning', '*/5 * * * *', 'select app_private.fire_morning()');
end $$;
