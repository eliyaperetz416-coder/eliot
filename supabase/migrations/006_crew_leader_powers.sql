-- More leader powers, all announced in the chat so everyone can see them:
--  * suspend a member for a while: they can still read, but cannot write chat or status (enforced by a trigger on messages)
--  * set a rating adjustment (0 to -500) that the crew leaderboard applies to that member's shown rating; their own rank on their phone is untouched
--  * give drachmas (1 to 1000): stored as a gift the member's app claims once, so a refund or a prize reaches them
alter table public.members add column if not exists suspended_until timestamptz;
alter table public.members add column if not exists adjust int not null default 0;
create table if not exists public.crew_gifts (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  amount int not null check (amount between 1 and 1000),
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.crew_gifts enable row level security;
revoke all on public.crew_gifts from anon, authenticated;

create or replace function app_private.block_suspended() returns trigger language plpgsql security definer set search_path = public as $$
declare s timestamptz;
begin
  if new.kind in ('chat', 'status') then
    select suspended_until into s from public.members where id = new.member_id;
    if s is not null and s > now() then raise exception 'suspended'; end if;
  end if;
  return new;
end $$;
create or replace trigger messages_block_suspended before insert on public.messages for each row execute function app_private.block_suspended();

create or replace function public.my_group(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; g public.groups;
begin
  m := app_private.member_of(p_token);
  update public.members set last_seen_at = now() where id = m.id;
  select * into g from public.groups where id = m.group_id;
  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'code', g.code),
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname, 'leader', m.is_leader, 'suspended_until', case when m.suspended_until > now() then m.suspended_until else null end, 'adjust', m.adjust),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at, 'plan', x.plan, 'leader', x.is_leader, 'adjust', x.adjust, 'suspended_until', case when x.suspended_until > now() then x.suspended_until else null end) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $$;

create or replace function public.suspend_member(p_token text, p_member_id uuid, p_hours int) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members; h int := coalesce(p_hours, 0);
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if h < 0 or h > 720 then raise exception 'bad_target'; end if;
  update public.members set suspended_until = case when h = 0 then null else now() + make_interval(hours => h) end where id = t.id;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', case when h = 0 then 'unsuspended' else 'suspended:' || h end);
end $$;

create or replace function public.set_adjust(p_token text, p_member_id uuid, p_value int) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members; v int := coalesce(p_value, 0);
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if v > 0 or v < -500 then raise exception 'bad_target'; end if;
  update public.members set adjust = v where id = t.id;
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'adjust:' || v);
end $$;

create or replace function public.give_drachmas(p_token text, p_member_id uuid, p_amount int) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; t public.members;
begin
  m := app_private.member_of(p_token);
  if not m.is_leader then raise exception 'not_leader'; end if;
  select * into t from public.members where id = p_member_id and group_id = m.group_id and active;
  if not found or t.id = m.id then raise exception 'bad_target'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then raise exception 'bad_target'; end if;
  insert into public.crew_gifts (member_id, amount) values (t.id, p_amount);
  insert into public.messages (group_id, member_id, nickname, kind, body) values (m.group_id, m.id, t.nickname, 'system', 'gift:' || p_amount);
end $$;

create or replace function public.claim_gifts(p_token text) returns int language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; total int;
begin
  m := app_private.member_of(p_token);
  with c as (update public.crew_gifts set claimed = true where member_id = m.id and not claimed returning amount)
  select coalesce(sum(amount), 0)::int into total from c;
  return total;
end $$;
grant execute on function public.suspend_member(text, uuid, int), public.set_adjust(text, uuid, int), public.give_drachmas(text, uuid, int), public.claim_gifts(text) to anon;
