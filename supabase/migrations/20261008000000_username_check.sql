-- Lets the sign up screen ask "is this username free?" while someone types.
--
-- Additive on purpose: nothing that already exists changes, so older app
-- builds keep working against a database that has this applied.

create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Your own current username counts as free, so editing a profile never
  -- tells you your own name is taken.
  select not exists (
    select 1
    from public.profiles p
    where p.username::text = lower(trim(p_username))
      and p.id is distinct from auth.uid()
  );
$$;

revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;
