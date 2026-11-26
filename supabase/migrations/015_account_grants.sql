-- Accounts, after the branch review (M-4): the signed-in role keeps only the rights the app uses on the account tables.
-- Supabase's default privileges had given `authenticated` everything (TRUNCATE, REFERENCES, TRIGGER too). Row level
-- security already limited every row to its owner and PostgREST cannot TRUNCATE, so nothing was reachable; this is defence
-- in depth. Only privileges change: no table, column, row, policy or function is touched.
revoke all on public.user_data, public.user_push, public.rest_alarms from authenticated;
grant select, insert, update on public.user_data to authenticated;
grant select, insert, update, delete on public.user_push, public.rest_alarms to authenticated;
