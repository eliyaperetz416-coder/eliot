-- Crews for everyone (Elia, 25.11): anyone can open a crew, not only the owner. In exchange the leader no longer has the
-- tools that reach into another person's account: changing their rating, prizes (drachmas / rating) and suspension (which
-- locked the whole app). Kept: rename, new code, remove a member, hand over the lead.
--  * create_group (4 arguments): the owner key is no longer needed (still accepted, ignored). Limits against floods: at most
--    30 new crews an hour on the whole server and 2000 crews in all.
--  * set_adjust, give_drachmas, suspend_member (every overload): refuse with 'removed'.
--  * existing rating adjustments and suspensions are cleared. Gifts already given stay claimable.
create or replace function public.create_group(p_name text, p_nick text, p_token text, p_owner_key text default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare g public.groups; m public.members; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; nick text := app_private.clean_nick(p_nick); gname text := left(trim(coalesce(p_name, '')), 40);
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  if nick = '' then raise exception 'bad_nick'; end if;
  if gname = '' then raise exception 'bad_name'; end if;
  if exists (select 1 from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then raise exception 'already_member'; end if;
  if (select count(*) from public.groups) >= 2000 then raise exception 'server_full'; end if;
  if (select count(*) from public.groups where created_at > now() - interval '1 hour') >= 30 then raise exception 'server_full'; end if;
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

create or replace function public.set_adjust(p_token text, p_member_id uuid, p_value integer) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
create or replace function public.set_adjust(p_token text, p_member_id uuid, p_value integer, p_announce boolean default true) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
create or replace function public.give_drachmas(p_token text, p_member_id uuid, p_amount integer) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
create or replace function public.give_drachmas(p_token text, p_member_id uuid, p_amount integer, p_announce boolean default true) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
create or replace function public.suspend_member(p_token text, p_member_id uuid, p_hours integer) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
create or replace function public.suspend_member(p_token text, p_member_id uuid, p_hours integer, p_announce boolean default true) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;

update public.members set adjust = 0 where adjust <> 0;
update public.members set suspended_until = null where suspended_until is not null;
