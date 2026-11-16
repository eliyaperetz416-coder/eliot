-- 011: the exercise-request "inbox" (OUR DESIGN). The app sends a request here; Claude reads the new ones with SQL when Elia asks,
-- adds the exercise to src/data/extra-exercises.json and marks the request 'added' (or 'rejected' with a short note).
-- Closed table (RLS on, no policies): only these two functions touch it. A phone is identified by a random device code; only its sha256 is kept.
create table if not exists public.exercise_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device_hash text not null,
  name text not null check (char_length(name) between 1 and 80),
  links text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 500),
  lang text not null default 'he' check (lang in ('he', 'en')),
  status text not null default 'new' check (status in ('new', 'added', 'rejected')),
  handled_at timestamptz,
  reply text not null default '' check (char_length(reply) <= 200)
);
alter table public.exercise_requests enable row level security;
create index if not exists exercise_requests_device on public.exercise_requests (device_hash, created_at desc);
create index if not exists exercise_requests_status on public.exercise_requests (status, created_at);

create or replace function public.submit_exercise_request(p_device text, p_name text, p_links jsonb default '[]'::jsonb, p_notes text default '', p_lang text default 'he')
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare dh text; n text := left(trim(coalesce(p_name, '')), 80); l text[] := '{}'; x text; new_id bigint;
begin
  if p_device is null or char_length(p_device) < 32 or char_length(p_device) > 128 then raise exception 'bad_token'; end if;
  if n = '' then raise exception 'bad_name'; end if;
  dh := encode(extensions.digest(p_device, 'sha256'), 'hex');
  if (select count(*) from public.exercise_requests where device_hash = dh and created_at > now() - interval '1 day') >= 10 then raise exception 'too_many'; end if;
  if (select count(*) from public.exercise_requests where created_at > now() - interval '1 day') >= 300 then raise exception 'server_full'; end if;
  if (select count(*) from public.exercise_requests where status = 'new') >= 1000 then raise exception 'server_full'; end if;
  if jsonb_typeof(p_links) = 'array' then
    for x in select value from jsonb_array_elements_text(p_links) limit 5 loop
      x := trim(x);
      if char_length(x) between 12 and 300 and x ~* '^https://[^\s<>"]+$' then l := l || x; end if;
    end loop;
  end if;
  insert into public.exercise_requests (device_hash, name, links, notes, lang)
  values (dh, n, l, left(trim(coalesce(p_notes, '')), 500), case when p_lang = 'en' then 'en' else 'he' end)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.my_exercise_requests(p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_device is null or char_length(p_device) < 32 then raise exception 'bad_token'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'reply', reply) order by id desc)
    from (select id, status, reply from public.exercise_requests where device_hash = encode(extensions.digest(p_device, 'sha256'), 'hex') order by id desc limit 50) r), '[]'::jsonb);
end $$;

revoke all on function public.submit_exercise_request(text, text, jsonb, text, text) from public;
revoke all on function public.my_exercise_requests(text) from public;
grant execute on function public.submit_exercise_request(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.my_exercise_requests(text) to anon, authenticated;
revoke all on table public.exercise_requests from anon, authenticated; -- the functions are the only way in
