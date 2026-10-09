-- Crew leader: the creator manages the crew. The leader can rename the crew, make a new invite code (the old one stops working),
-- remove a member, and hand leadership to someone else. If the leader leaves, the longest-standing member takes over.
alter table public.members add column if not exists is_leader boolean not null default false;
update public.members set is_leader = true where id in (select distinct on (group_id) id from public.members where active order by group_id, joined_at);

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
  insert into public.members (group_id, token_hash, nickname, is_leader) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick, true) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'created');
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
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname, 'leader', m.is_leader),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at, 'plan', x.plan, 'leader', x.is_leader) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $$;

create or replace function public.leave_group(p_token text) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; nxt public.members;
begin
  m := app_private.member_of(p_token);
  update public.members set active = false, is_leader = false, token_hash = 'left:' || id::text, nickname = left(nickname, 15) || '~' || substr(id::text, 1, 6) where id = m.id;
  update public.push_subs set enabled = false where member_id = m.id;
  if m.is_leader then
    select * into nxt from public.members where group_id = m.group_id and active order by joined_at limit 1;
    if found then
      update public.members set is_leader = true where id = nxt.id;
      insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, nxt.id, nxt.nickname, 'system', 'leader');
    end if;
  end if;
end $$;

create or replace function public.kick_member(p_token text, p_member_id uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  update public.members set active = false, is_leader = false, token_hash = 'left:' || id::text, nickname = left(nickname, 15) || '~' || substr(id::text, 1, 6) where id = t.id;
  update public.push_subs set enabled = false where member_id = t.id;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'removed');
end $$;

create or replace function public.make_leader(p_token text, p_member_id uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  update public.members set is_leader = (id = t.id) where id in (m.id, t.id);
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, t.id, t.nickname, 'system', 'leader');
end $$;

create or replace function public.rename_group(p_token text, p_name text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; gname text := left(trim(coalesce(p_name, '')), 40);
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  if gname = '' then raise exception 'bad_name'; end if;
  update public.groups set name = gname where id = m.group_id;
  return gname;
end $$;

create or replace function public.new_code(p_token text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  update public.groups set code = c where id = m.group_id;
  return c;
end $$;
grant execute on function public.kick_member(text, uuid), public.make_leader(text, uuid), public.rename_group(text, text), public.new_code(text) to anon;
