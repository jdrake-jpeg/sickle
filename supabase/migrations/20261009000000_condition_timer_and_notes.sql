-- Court conditions are temporary, and admins can pin permanent notes.
--
--   * Player reports of how a court is right now fade after 2 hours (they used
--     to last 6, which is too long for things like "crowded").
--   * Admins can add a permanent note to a court (hours, parking, rules). It
--     never fades and is shown to everyone on the court's page.
--
-- Additive: older app builds keep working against a database that has this.

create or replace function public.court_conditions(p_court uuid)
returns table (condition public.court_condition, note text, reporter_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.condition, r.note, p.display_name, r.created_at
  from public.court_condition_reports r
  join public.profiles p on p.id = r.reporter_id
  where r.court_id = p_court and r.created_at > now() - interval '2 hours'
  order by r.created_at desc
  limit 20;
$$;

create or replace function public.latest_court_conditions()
returns table (court_id uuid, condition public.court_condition, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (r.court_id) r.court_id, r.condition, r.created_at
  from public.court_condition_reports r
  where r.created_at > now() - interval '2 hours'
  order by r.court_id, r.created_at desc;
$$;

alter table public.courts add column admin_note text check (char_length(admin_note) <= 300);

-- Only admins write the note. A blank note clears it.
create function public.admin_set_court_note(p_court uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_admin() then raise exception 'Only admins can add court notes'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'Unknown court'; end if;
  if char_length(v_note) > 300 then raise exception 'Keep the note under 300 characters'; end if;
  update public.courts set admin_note = v_note where id = p_court;
end;
$$;

revoke execute on function public.admin_set_court_note(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_court_note(uuid, text) to authenticated;
