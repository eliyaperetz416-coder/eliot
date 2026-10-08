-- A weekday in the shared plan can hold up to 4 items (for example basketball and a strength workout). The function accepts the
-- older one-object-per-day format too and always stores a list of {k, n}. Still no exercises, sets or weights.
create or replace function public.update_plan(p_token text, p_plan jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; clean jsonb := null; days jsonb := '{}'::jsonb; d int; src jsonb; e jsonb; items jsonb; trained jsonb := '[]'::jsonb; t text;
begin
  m := app_private.member_of(p_token);
  if p_plan is not null and jsonb_typeof(p_plan) = 'object' then
    for d in 0..6 loop
      src := p_plan -> 'days' -> d::text;
      items := '[]'::jsonb;
      if src is not null and jsonb_typeof(src) = 'object' then src := jsonb_build_array(src); end if;
      if src is not null and jsonb_typeof(src) = 'array' then
        for e in select value from jsonb_array_elements(src) limit 4 loop
          if jsonb_typeof(e) = 'object' and (e ->> 'k') in ('workout', 'rest', 'activity') then
            items := items || jsonb_build_array(jsonb_build_object('k', e ->> 'k', 'n', left(coalesce(e ->> 'n', ''), 30)));
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
  update public.members set plan = clean where id = m.id;
end $$;
