-- 009: save_push only accepts endpoints of real push services, so the notify function (which runs with the
-- service role and posts to every saved endpoint) can never be pointed at any other web address.
-- Same list as Habit Coach's hc_push_endpoint_ok. Existing rows were checked first: all on Apple/Google.
create or replace function public.save_push(p_token text, p_sub jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare m public.members; ep text;
begin
  m := app_private.member_of(p_token);
  if p_sub is null or jsonb_typeof(p_sub) <> 'object' or not (p_sub ? 'endpoint') or length(p_sub::text) > 2000 then raise exception 'bad_sub'; end if;
  ep := p_sub->>'endpoint';
  if ep is null or ep !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/' then raise exception 'bad_sub'; end if;
  insert into public.push_subs (member_id, sub, enabled) values (m.id, p_sub, true) on conflict (member_id) do update set sub = excluded.sub, enabled = true, updated_at = now();
end $function$;
