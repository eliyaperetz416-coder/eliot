-- 014: account sync safety (after the whole-branch review). Additive: only the account tables from 013 change; nothing is dropped.
--  * user_data.version: the server counts every write (a trigger), and updated_at is the server's clock, not the phone's.
--    The app writes with "only if the version is still N" (compare-and-swap); 0 rows means another phone wrote first -> merge.
--  * the size limit stays 8,000,000 bytes of jsonb text; the app keeps its own snapshot under 7 MB of compact JSON, so the
--    server never refuses what the app thought was fine (jsonb text has extra spaces).
--  * user_push only accepts endpoints of real push services (same list as 009), so rest-push can never be pointed elsewhere.

alter table public.user_data add column if not exists version bigint not null default 1;

create or replace function app_private.user_data_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := case when tg_op = 'INSERT' then 1 else old.version + 1 end;
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  return new;
end $$;
revoke all on function app_private.user_data_stamp() from public, anon, authenticated;
create trigger user_data_stamp before insert or update on public.user_data for each row execute function app_private.user_data_stamp();

alter table public.user_push add constraint user_push_endpoint check (
  jsonb_typeof(sub) = 'object' and length(sub::text) <= 2000
  and (sub->>'endpoint') ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
);
