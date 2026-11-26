-- The push function can take a few seconds on its first call of the day (a cold start): pg_net's default 5 s wait gave up
-- although the push went out (26.11, 08:00). Both senders now wait up to 30 s, so the result is recorded. Same bodies otherwise.
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
    body := jsonb_build_object('alarms', items),
    timeout_milliseconds := 30000);
end $$;
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
    body := jsonb_build_object('alarms', items),
    timeout_milliseconds := 30000);
end $$;
