-- With crews open to everyone (016), the leader no longer reads a member's daily history and latest heavy sets: that
-- review only served the removed prize screen. The function stays (its signature is in use by old apps) and refuses.
create or replace function public.get_member_review(p_token text, p_member_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $function$ begin raise exception 'removed'; end $function$;
