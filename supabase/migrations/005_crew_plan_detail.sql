-- Opt-in: when you share your plan, a strength workout in it can carry its exercise list (library exercise id, sets, rep range; NO weights),
-- so a friend can open it and add a copy to their own workouts. The list is stored apart from the plan (plan_x) and is NOT part of my_group,
-- so the 7-second refresh stays small. get_plan_detail returns it for one member of your own crew, and only while they share their plan.
alter table public.members add column if not exists plan_x jsonb;

create or replace function public.update_plan(p_token text, p_plan jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; clean jsonb := null; days jsonb := '{}'::jsonb; detail jsonb := '{}'::jsonb; d int; src jsonb; e jsonb; xe jsonb; items jsonb; xs jsonb; trained jsonb := '[]'::jsonb; t text; rec record;
begin
  m := app_private.member_of(p_token);
  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    for d in 0..6 loop
      src := p_plan -> 'days' -> d::text;
      items := '[]'::jsonb;
      if src is not null and jsonb_typeof(src) = 'object' then src := jsonb_build_array(src); end if;
      if src is not null and jsonb_typeof(src) = 'array' then
        for rec in select value as v from jsonb_array_elements(src) limit 4 loop
          e := rec.v;
          if jsonb_typeof(e) = 'object' and (e ->> 'k') in ('workout', 'rest', 'activity') then
            items := items || jsonb_build_array(jsonb_build_object('k', e ->> 'k', 'n', left(coalesce(e ->> 'n', ''), 30)));
            xs := '[]'::jsonb;
            if (e ->> 'k') = 'workout' and jsonb_typeof(e -> 'x') = 'array' then
              for xe in select value from jsonb_array_elements(e -> 'x') limit 20 loop
                if jsonb_typeof(xe) = 'object' and (xe ->> 'e') ~ '^[a-z0-9_-]{1,80}$' and (xe ->> 's') ~ '^[0-9]{1,2}$' and (xe ->> 'a') ~ '^[0-9]{1,3}$' and (xe ->> 'b') ~ '^[0-9]{1,3}$' then
                  xs := xs || jsonb_build_array(jsonb_build_object('e', xe ->> 'e', 's', least(10, (xe ->> 's')::int), 'a', (xe ->> 'a')::int, 'b', (xe ->> 'b')::int));
                end if;
              end loop;
            end if;
            if jsonb_array_length(xs) > 0 then detail := detail || jsonb_build_object(d::text || '-' || (jsonb_array_length(items) - 1)::text, xs); end if;
          end if;
        end loop;
      end if;
      if jsonb_array_length(items) > 0 then days := days || jsonb_build_object(d::text, items); end if;
    end loop;
    if jsonb_typeof(p_plan -> 'trained') = 'array' then
      for t in select jsonb_array_elements_text(p_plan -> 'trained') limit 7 loop
        if t ~ '^\d{4}-\d{2}-\d{2}$' then trained := trained || to_jsonb(t); end if;
      end loop;
    end if;
    clean := jsonb_build_object('days', days, 'trained', trained);
  end if;
  update public.members set plan = clean, plan_x = case when clean is null then null else detail end where id = m.id;
end $$;

create or replace function public.get_plan_detail(p_token text, p_member_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; r jsonb;
begin
  m := app_private.member_of(p_token);
  select coalesce(x.plan_x, '{}'::jsonb) into r from public.members x where x.id = p_member_id and x.group_id = m.group_id and x.active and x.plan is not null;
  return coalesce(r, '{}'::jsonb);
end $$;
grant execute on function public.get_plan_detail(text, uuid) to anon;
