-- Only let @ualberta.ca emails create accounts (issue #31).
-- Supabase Auth calls this before creating any user, so it can't be skipped by calling Supabase directly.
--
-- Setup on a Supabase project (the migration alone does not turn it on):
-- 1. Run this file in Supabase → SQL Editor.
-- 2. Authentication → Hooks → add a "Before User Created" hook,
--    type Postgres, function public.hook_restrict_signup_to_ualberta.

create or replace function public.hook_restrict_signup_to_ualberta(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if email like '%@ualberta.ca' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cohort is only open to @ualberta.ca accounts.',
      'http_code', 403
    )
  );
end;
$$;

-- Only Supabase Auth may call the hook
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup_to_ualberta(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_to_ualberta(jsonb) from public, anon, authenticated;
