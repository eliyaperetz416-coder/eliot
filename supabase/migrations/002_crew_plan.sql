-- Optional sharing of your weekly plan with the crew (opt-in in the app). Adds one nullable column, one function, and
-- returns the column from my_group. Only weekday -> {kind, short name} and this week's trained dates are stored: no exercises, sets or weights.
alter table public.members add column if not exists plan jsonb;

create or replace function public.update_plan(p_token text, p_plan jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; clean jsonb := null; days jsonb := '{}'::jsonb; d int; e jsonb; trained jsonb := '[]'::jsonb; t text;
begin
  m := app_private.member_of(p_token);
  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    for d in 0..6 loop
      e := p_plan -> 'days' -> d::text;
      if e is not null and jsonb_typeof(e) = 'object' and (e ->> 'k') in ('workout', 'rest', 'activity') then
        days := days || jsonb_build_object(d::text, jsonb_build_object('k', e ->> 'k', 'n', left(coalesce(e ->> 'n', ''), 30)));
      end if;
    end loop;
    if jsonb_typeof(p_plan -> 'trained') = 'array' then
      for t in select jsonb_array_elements_text(p_plan -> 'trained') limit 7 loop
        if t ~ '^\d{4}-\d{2}-\d{2}$' then trained := trained || to_jsonb(t); end if;
      end loop;
    end if;
    clean := jsonb_build_object('days', days, 'trained', trained);
  end if;
  update public.members set plan = clean where id = m.id;
end $$;
grant execute on function public.update_plan(text, jsonb) to anon;

create or replace function public.my_group(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; g public.groups;
begin
  m := app_private.member_of(p_token);
  update public.members set last_seen_at = now() where id = m.id;
  select * into g from public.groups where id = m.group_id;
  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'code', g.code),
    'me', jsonb_build_object('id', m.id, 'nickname', m.nickname),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'stats', x.stats, 'stats_updated_at', x.stats_updated_at, 'plan', x.plan) order by x.joined_at) from public.members x where x.group_id = g.id and x.active), '[]'::jsonb));
end $$;
