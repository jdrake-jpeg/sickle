-- Round 7: a preferred time for each day, and clearing alerts. Additive.

-- ---------------------------------------------------------------------------
-- Preferred times, one 2 hour window per day.
-- A JSON object: the day (0 Sunday to 6 Saturday) and the window's start in
-- minutes after midnight. Example: {"1": 1140, "6": 600} is Monday 7 to 9 PM
-- and Saturday 10 AM to 12 PM. The older preferred_days and preferred_start
-- columns stay (builds from earlier this week read them) but are no longer used.
-- ---------------------------------------------------------------------------

create function public.valid_preferred_windows(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('0', '1', '2', '3', '4', '5', '6') then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then return false; end if;
    if (v #>> '{}')::integer not between 0 and 1320 then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.profiles
  add column preferred_windows jsonb not null default '{}'
    check (public.valid_preferred_windows(preferred_windows));

-- Carry over what people already picked: the same window on each chosen day.
update public.profiles
set preferred_windows = (
  select coalesce(jsonb_object_agg(d::text, preferred_start), '{}'::jsonb)
  from unnest(preferred_days) as d
)
where preferred_start is not null and cardinality(preferred_days) > 0;

grant update (preferred_windows) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Alerts: read one, clear them all.
-- ---------------------------------------------------------------------------

create function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where id = p_id and profile_id = auth.uid() and read_at is null;
$$;

create function public.clear_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where profile_id = auth.uid();
$$;

revoke execute on function public.mark_notification_read(uuid), public.clear_notifications() from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid), public.clear_notifications() to authenticated;
