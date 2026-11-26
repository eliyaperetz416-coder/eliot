-- Being able to tell what happened (Elia, 26.11, after the "someone already got in" simulation). Additive.
--  * A4  a security log, kept 30 days: account deleted, crew created / joined / left / new leader / renamed / new code, first
--        save of an account, a new app version saving, and a save that suddenly lost more than half of the data. Each row
--        has the time, who, the IP address and the device (browser line). Never the content of anyone's data or chat.
--  * A6  a crew of one person in which nothing happened for 7 days is removed, and one address can open at most 3 crews
--        a day (so nobody can fill the server's crew limits and block everyone else).
--  * the daily clean-up also erases what migration 020 keeps for a deleted account once 24 hours have passed.

create table if not exists app_private.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  actor text,
  detail jsonb,
  ip text,
  ua text
);
create index if not exists audit_log_at on app_private.audit_log (at);
revoke all on app_private.audit_log from public, anon, authenticated;

-- the caller's address and device line from the request (null when the database itself runs the code, e.g. cron)
create or replace function app_private.req_ip() returns text
language sql stable set search_path = '' as $$
  select left(coalesce(h ->> 'cf-connecting-ip', nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')), 64)
  from (select nullif(current_setting('request.headers', true), '')::json as h) x
$$;
create or replace function app_private.req_ua() returns text
language sql stable set search_path = '' as $$
  select left((nullif(current_setting('request.headers', true), '')::json) ->> 'user-agent', 160)
$$;

create or replace function app_private.audit(p_action text, p_actor text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into app_private.audit_log (action, actor, detail, ip, ua)
  values (p_action, left(p_actor, 80), p_detail, app_private.req_ip(), app_private.req_ua());
exception when others then null; -- the log must never stop the action it describes
end $$;

create or replace function app_private.audit_members() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.audit(case when new.is_leader then 'crew_created' else 'crew_joined' end, new.id::text,
      jsonb_build_object('group', new.group_id, 'nick', new.nickname));
  elsif new.is_leader and not old.is_leader then
    perform app_private.audit('crew_new_leader', new.id::text, jsonb_build_object('group', new.group_id, 'nick', new.nickname));
  elsif old.active and not new.active then
    perform app_private.audit('crew_left', new.id::text, jsonb_build_object('group', new.group_id, 'nick', new.nickname));
  end if;
  return null;
end $$;
drop trigger if exists audit_members on public.members;
create trigger audit_members after insert or update of is_leader, active on public.members
  for each row execute function app_private.audit_members();

create or replace function app_private.audit_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then perform app_private.audit('crew_renamed', new.id::text, jsonb_build_object('name', new.name)); end if;
  if new.code is distinct from old.code then perform app_private.audit('crew_new_code', new.id::text, null); end if;
  return null;
end $$;
drop trigger if exists audit_groups on public.groups;
create trigger audit_groups after update of name, code on public.groups for each row execute function app_private.audit_groups();

create or replace function app_private.audit_user_data() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_n int; after_n int := octet_length(new.data::text);
begin
  if tg_op = 'INSERT' then
    perform app_private.audit('data_first_save', new.user_id::text, jsonb_build_object('bytes', after_n, 'app', new.app_version));
    return null;
  end if;
  before_n := octet_length(old.data::text);
  if new.app_version is distinct from old.app_version then
    perform app_private.audit('data_new_app', new.user_id::text, jsonb_build_object('from', old.app_version, 'to', new.app_version));
  end if;
  if before_n > 2000 and after_n * 2 < before_n then
    perform app_private.audit('data_shrank', new.user_id::text, jsonb_build_object('from', before_n, 'to', after_n, 'version', new.version));
  end if;
  return null;
end $$;
drop trigger if exists audit_user_data on public.user_data;
create trigger audit_user_data after insert or update on public.user_data for each row execute function app_private.audit_user_data();

create or replace function app_private.audit_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.audit('account_deleted', new.user_id::text, null);
  return null;
end $$;
drop trigger if exists audit_deleted on app_private.deleted_accounts;
create trigger audit_deleted after insert or update on app_private.deleted_accounts for each row execute function app_private.audit_deleted();

revoke all on function app_private.req_ip(), app_private.req_ua(), app_private.audit(text, text, jsonb), app_private.audit_members(),
  app_private.audit_groups(), app_private.audit_user_data(), app_private.audit_deleted() from public, anon, authenticated;

-- A6: at most 3 new crews a day from one address (on top of the server-wide limits of migration 016)
create or replace function public.create_group(p_name text, p_nick text, p_token text, p_owner_key text default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare g public.groups; m public.members; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; nick text := app_private.clean_nick(p_nick); gname text := left(trim(coalesce(p_name, '')), 40); ip text := app_private.req_ip();
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  if nick = '' then raise exception 'bad_nick'; end if;
  if gname = '' then raise exception 'bad_name'; end if;
  if exists (select 1 from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then raise exception 'already_member'; end if;
  if (select count(*) from public.groups) >= 2000 then raise exception 'server_full'; end if;
  if (select count(*) from public.groups where created_at > now() - interval '1 hour') >= 30 then raise exception 'server_full'; end if;
  if ip is not null then perform app_private.rate_hit(md5('create_group:' || ip)::uuid, 'create_group', 3, interval '1 day'); end if;
  loop
    c := '';
    for i in 1..8 loop c := c || substr(alphabet, 1 + get_byte(extensions.gen_random_bytes(1), 0) % 32, 1); end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (code, name) values (c, gname) returning * into g;
  insert into public.members (group_id, token_hash, nickname, is_leader) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick, true) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'created');
  return jsonb_build_object('code', g.code, 'name', g.name, 'member_id', m.id);
end $function$;

-- the daily clean-up
create or replace function app_private.daily_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
declare gone uuid[];
begin
  delete from app_private.audit_log where at < now() - interval '30 days';
  -- what was kept for a deleted account: 24 hours, then erased
  delete from app_private.user_data_history h using app_private.deleted_accounts d
    where h.user_id = d.user_id and d.deleted_at < now() - interval '24 hours';
  delete from app_private.deleted_accounts where deleted_at < now() - interval '24 hours';
  delete from app_private.user_data_history h
    where not exists (select 1 from auth.users u where u.id = h.user_id)
      and not exists (select 1 from app_private.deleted_accounts d where d.user_id = h.user_id);
  -- A6: crews of one person, a week without anything happening
  select coalesce(array_agg(g.id), '{}') into gone from public.groups g
  where g.created_at < now() - interval '7 days'
    and (select count(*) from public.members m where m.group_id = g.id and m.active) <= 1
    and not exists (select 1 from public.members m where m.group_id = g.id and m.last_seen_at > now() - interval '7 days')
    and not exists (select 1 from public.messages x where x.group_id = g.id and x.kind <> 'system' and x.created_at > now() - interval '7 days');
  if array_length(gone, 1) is null then return; end if;
  delete from public.push_subs where member_id in (select id from public.members where group_id = any (gone));
  delete from public.crew_gifts where member_id in (select id from public.members where group_id = any (gone));
  delete from public.crew_returns where member_id in (select id from public.members where group_id = any (gone));
  delete from public.member_history where member_id in (select id from public.members where group_id = any (gone));
  delete from public.messages where group_id = any (gone);
  delete from public.members where group_id = any (gone);
  delete from public.groups where id = any (gone);
  perform app_private.audit('crew_removed_idle', null, jsonb_build_object('groups', to_jsonb(gone)));
end $$;
revoke all on function app_private.daily_cleanup() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'demigod-cleanup') then perform cron.unschedule('demigod-cleanup'); end if;
  perform cron.schedule('demigod-cleanup', '41 2 * * *', 'select app_private.daily_cleanup()');
end $$;
