-- 010: crews of up to 20 people; invite codes of 8 characters for new crews and regenerated codes (6-character codes keep working).
-- Applied live with create or replace (already done, this file records it). OUR DESIGN.
-- join_group: one joiner at a time per crew (advisory lock), so two people joining together cannot both pass the size check.
create or replace function public.join_group(p_code text, p_nick text, p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.groups; m public.members; nick text := app_private.clean_nick(p_nick);
begin
  if p_token is null or char_length(p_token) < 32 then raise exception 'bad_token'; end if;
  if nick = '' then raise exception 'bad_nick'; end if;
  if exists (select 1 from public.members where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then raise exception 'already_member'; end if;
  select * into g from public.groups where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'no_group'; end if;
  perform pg_advisory_xact_lock(hashtext('join:' || g.id::text));
  if (select count(*) from public.members where group_id = g.id and active) >= 20 then raise exception 'group_full'; end if;
  if exists (select 1 from public.members where group_id = g.id and lower(nickname) = lower(nick)) then raise exception 'nick_taken'; end if;
  insert into public.members (group_id, token_hash, nickname) values (g.id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nick) returning * into m;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (g.id, m.id, nick, 'system', 'joined');
  return jsonb_build_object('code', g.code, 'name', g.name, 'member_id', m.id);
end $$;
-- new_code and create_group: the same bodies as migration 007 with `for i in 1..8` instead of `1..6` (see the live functions).
