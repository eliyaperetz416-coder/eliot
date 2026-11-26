-- Push that does not get lost, and a morning report for the owner (Elia, 26.11). Additive.
--  * A13 every batch the database hands to rest-push is remembered for a few minutes; when the call failed (the function
--        was busy, a timeout) it is sent again, at most twice, and only within 3 minutes (a "rest is over" that comes late
--        is worse than none). A batch that still fails is written to the security log ('push_failed').
--  * A5  every morning at 07:31 (Israel, winter) the owner gets one notification: new accounts, sign-ins, new crews,
--        deleted accounts, failures, saves that suddenly lost data, database size. The title says ✅ or ⚠️.
--        The owner is the first account ever created (no address or id is written in this public file).
--  rest alarms and the morning reminder now go out through the same sender, each with its own tag.

create table if not exists app_private.push_outbox (
  net_id bigint primary key,
  body jsonb not null,
  tries int not null default 0,
  created_at timestamptz not null default now()
);
revoke all on app_private.push_outbox from public, anon, authenticated;

create or replace function app_private.send_push(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s text; rid bigint; b jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then return; end if;
  b := jsonb_build_object('alarms', p_items);
  select value into s from public.app_config where key = 'notify_secret';
  rid := net.http_post(
    url := 'https://szhdasydkoqtbmbrmzpi.supabase.co/functions/v1/rest-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    body := b,
    timeout_milliseconds := 30000);
  insert into app_private.push_outbox (net_id, body) values (rid, b);
end $$;

create or replace function app_private.retry_push() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; s text; rid bigint;
begin
  for r in
    select o.net_id, o.body, o.tries, o.created_at, x.id is not null as answered, x.status_code
    from app_private.push_outbox o left join net._http_response x on x.id = o.net_id
  loop
    if r.answered and r.status_code between 200 and 299 then
      delete from app_private.push_outbox where net_id = r.net_id;
    elsif not r.answered then
      if r.created_at < now() - interval '15 minutes' then delete from app_private.push_outbox where net_id = r.net_id; end if;
    elsif r.tries < 2 and r.created_at > now() - interval '3 minutes' then
      select value into s from public.app_config where key = 'notify_secret';
      rid := net.http_post(
        url := 'https://szhdasydkoqtbmbrmzpi.supabase.co/functions/v1/rest-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
        body := r.body,
        timeout_milliseconds := 30000);
      update app_private.push_outbox set net_id = rid, tries = tries + 1 where net_id = r.net_id;
    else
      delete from app_private.push_outbox where net_id = r.net_id;
      perform app_private.audit('push_failed', null, jsonb_build_object('status', r.status_code, 'tries', r.tries + 1,
        'count', jsonb_array_length(r.body -> 'alarms'), 'tag', r.body -> 'alarms' -> 0 ->> 'tag'));
    end if;
  end loop;
end $$;

create or replace function app_private.fire_rest_alarms() returns void
language plpgsql security definer set search_path = '' as $$
declare items jsonb;
begin
  with due as (delete from public.rest_alarms where fire_at <= now() returning user_id, title, body)
  select jsonb_agg(jsonb_build_object('sub', p.sub, 'title', d.title, 'body', d.body, 'tag', 'rest')) into items
  from due d join public.user_push p on p.user_id = d.user_id and p.rest_enabled;
  perform app_private.send_push(items);
end $$;

create or replace function app_private.fire_morning() returns void
language plpgsql security definer set search_path = '' as $$
declare items jsonb;
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
  select jsonb_agg(jsonb_build_object('sub', sub, 'title', left(msg ->> 'title', 120), 'body', left(msg ->> 'body', 160), 'tag', 'morning')) into items
  from due where msg ->> 'title' is not null;
  perform app_private.send_push(items);
end $$;

insert into public.app_config (key, value)
  select 'report_user', id::text from auth.users order by created_at limit 1
on conflict (key) do nothing;

create or replace function app_private.daily_report() returns void
language plpgsql security definer set search_path = '' as $$
declare owner uuid; sub jsonb; n_users int; n_sessions int; n_groups int; n_deleted int; n_fail int; n_shrank int; db_mb int; alerts int; title text; body text;
begin
  select value::uuid into owner from public.app_config where key = 'report_user' and value ~ '^[0-9a-f-]{36}$';
  if owner is null then return; end if;
  select p.sub into sub from public.user_push p where p.user_id = owner;
  if sub is null then return; end if;
  select count(*) into n_users from auth.users where created_at > now() - interval '24 hours';
  select count(*) into n_sessions from auth.sessions where created_at > now() - interval '24 hours';
  select count(*) into n_groups from public.groups where created_at > now() - interval '24 hours';
  select count(*) filter (where action = 'account_deleted'), count(*) filter (where action = 'push_failed'), count(*) filter (where action = 'data_shrank')
    into n_deleted, n_fail, n_shrank from app_private.audit_log where at > now() - interval '24 hours';
  n_fail := n_fail + (select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                      where j.jobname like 'demigod-%' and d.status <> 'succeeded' and d.start_time > now() - interval '24 hours');
  db_mb := (pg_database_size(current_database()) / 1048576)::int;
  alerts := (n_fail > 0)::int + (n_deleted > 0)::int + (n_shrank > 0)::int + (n_users > 20)::int + (n_groups > 10)::int + (db_mb > 300)::int;
  title := case when alerts > 0 then '⚠️ Demigod · ' || alerts || ' דברים לבדוק' else '✅ Demigod · הכל תקין' end;
  body := 'חדשים ' || n_users || ' · כניסות ' || n_sessions || ' · קבוצות חדשות ' || n_groups || ' · נמחקו ' || n_deleted
       || ' · תקלות ' || n_fail || ' · ירידה חשודה ' || n_shrank || ' · ' || db_mb || 'MB';
  perform app_private.send_push(jsonb_build_array(jsonb_build_object('sub', sub, 'title', title, 'body', body, 'tag', 'report', 'url', '#/')));
end $$;

revoke all on function app_private.send_push(jsonb), app_private.retry_push(), app_private.fire_rest_alarms(), app_private.fire_morning(),
  app_private.daily_report() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'demigod-push-retry') then perform cron.unschedule('demigod-push-retry'); end if;
  perform cron.schedule('demigod-push-retry', '* * * * *', 'select app_private.retry_push()');
  if exists (select 1 from cron.job where jobname = 'demigod-report') then perform cron.unschedule('demigod-report'); end if;
  perform cron.schedule('demigod-report', '31 5 * * *', 'select app_private.daily_report()');
end $$;
