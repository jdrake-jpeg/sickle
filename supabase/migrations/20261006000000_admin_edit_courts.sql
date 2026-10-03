-- Admins can fix or remove any court.
--   * admin_update_court changes a court's name, address, size, indoor/outdoor
--     or pin. Blank or null values leave that field as it is.
--   * admin_remove_court deletes a court nobody has played or challenged at.
--     A court with challenges or matches is hidden instead (status 'rejected'),
--     so match history and leaderboards stay intact.

create function public.admin_update_court(
  p_court uuid,
  p_name text default null,
  p_address text default null,
  p_court_count integer default null,
  p_indoor boolean default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
begin
  if not public.is_admin() then raise exception 'Only admins can edit courts'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'Unknown court'; end if;
  if v_name is not null and char_length(v_name) not between 2 and 60 then
    raise exception 'Give the court a name (2 to 60 letters)';
  end if;
  if p_court_count is not null and p_court_count not between 1 and 50 then
    raise exception 'Number of courts should be between 1 and 50';
  end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Drop a pin'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    raise exception 'Drop a pin';
  end if;

  update public.courts
  set name = coalesce(v_name, name),
      address = case when p_address is null then address else nullif(btrim(p_address), '') end,
      court_count = coalesce(p_court_count, court_count),
      indoor = coalesce(p_indoor, indoor),
      lat = coalesce(p_lat, lat),
      lng = coalesce(p_lng, lng)
  where id = p_court;
end;
$$;

-- Returns 'deleted' or 'hidden'.
create function public.admin_remove_court(p_court uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can remove courts'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'Unknown court'; end if;

  if exists (select 1 from public.challenges where court_id = p_court)
     or exists (select 1 from public.matches where court_id = p_court) then
    update public.courts
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = 'Removed by an admin'
    where id = p_court;
    return 'hidden';
  end if;

  delete from public.courts where id = p_court;
  return 'deleted';
end;
$$;

revoke execute on function
  public.admin_update_court(uuid, text, text, integer, boolean, double precision, double precision),
  public.admin_remove_court(uuid)
from public, anon, authenticated;
grant execute on function
  public.admin_update_court(uuid, text, text, integer, boolean, double precision, double precision),
  public.admin_remove_court(uuid)
to authenticated;
