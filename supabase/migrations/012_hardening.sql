-- 012: hardening after the security review (OUR DESIGN, approved by Elia).
--  * per-member rate limits on the calls a phone repeats (feed, crew view, stats, plan): far above normal use
--    (the feed refreshes every 7 s = ~9 a minute; stats at most every 30 s), so only a flooding script hits them -> 'too_fast'
--  * update_stats keeps only believable numbers (rating has no maximum by design, so its cap is generous: 3000)
--  * invite codes come from a cryptographic random source (gen_random_bytes) instead of random()
--  * the old overloads that the app no longer calls (it always sends p_announce / p_owner_key) are closed to the app
-- The changed functions are rebuilt from their LIVE definitions with one line replaced, so nothing else in them changes.

create table if not exists app_private.rate_hits (
  member_id uuid not null,
  bucket text not null,
  window_start timestamptz not null default now(),
  n int not null default 0,
  primary key (member_id, bucket)
);
revoke all on app_private.rate_hits from public, anon, authenticated;

-- Counts one call; over the limit it raises 'too_fast'. The raise rolls back its own +1, so the count rests at the limit
-- until the window has passed, and the first call after that starts a new window.
create or replace function app_private.rate_hit(p_member uuid, p_bucket text, p_limit int, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
declare cnt int;
begin
  insert into app_private.rate_hits as r (member_id, bucket, window_start, n) values (p_member, p_bucket, now(), 1)
  on conflict (member_id, bucket) do update set
    n = case when r.window_start < now() - p_window then 1 else r.n + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning n into cnt;
  if cnt > p_limit then raise exception 'too_fast'; end if;
end $$;
revoke all on function app_private.rate_hit(uuid, text, int, interval) from public, anon, authenticated;

do $$
declare
  f record;
  def text;
  limits constant jsonb := '{"get_messages": 60, "my_group": 60, "get_plan_detail": 60, "update_stats": 20, "update_plan": 20}';
  hook constant text := 'm := app_private.member_of(p_token);';
  pick_old constant text := 'substr(alphabet, 1 + floor(random() * 32)::int, 1)';
  pick_new constant text := 'substr(alphabet, 1 + get_byte(extensions.gen_random_bytes(1), 0) % 32, 1)';
  caps_old constant text := 'if v between 0 and 100000000 then';
  caps_new constant text := 'if v >= 0 and v <= (case k when ''rating'' then 3000 when ''level'' then 1000 when ''streak'' then 3660 when ''weekVolume'' then 500000 when ''monthWorkouts'' then 93 when ''workouts'' then 50000 when ''tierIndex'' then 20 end) then';
begin
  -- 1. rate limits
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (select jsonb_object_keys(limits)) loop
    def := pg_get_functiondef(f.oid);
    if position('app_private.rate_hit(' in def) > 0 then continue; end if; -- already applied
    if (length(def) - length(replace(def, hook, ''))) / length(hook) <> 1 then raise exception 'unexpected body: %', f.proname; end if;
    execute replace(def, hook, hook || format(E'\n  perform app_private.rate_hit(m.id, %L, %s, interval ''1 minute'');', f.proname, limits ->> f.proname));
  end loop;

  -- 2. believable stats
  def := pg_get_functiondef('public.update_stats(text, jsonb)'::regprocedure);
  if position(caps_old in def) > 0 then execute replace(def, caps_old, caps_new);
  elsif position('when ''rating'' then 3000' in def) = 0 then raise exception 'update_stats: stats check not found'; end if;

  -- 3. cryptographic invite codes
  for f in select unnest(array['public.new_code(text)', 'public.create_group(text, text, text, text)'])::regprocedure as oid loop
    def := pg_get_functiondef(f.oid);
    if position(pick_old in def) > 0 then execute replace(def, pick_old, pick_new);
    elsif position(pick_new in def) = 0 then raise exception 'code picker not found in %', f.oid; end if;
  end loop;
end $$;

-- 4. close the overloads the app no longer calls
revoke execute on function public.create_group(text, text, text), public.give_drachmas(text, uuid, int), public.kick_member(text, uuid),
  public.make_leader(text, uuid), public.set_adjust(text, uuid, int), public.suspend_member(text, uuid, int) from public, anon, authenticated;
