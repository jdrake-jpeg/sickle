-- Public records with a privacy switch, and court lights.

-- ---------------------------------------------------------------------------
-- Fix: let signed-in players use citext's own functions
-- ---------------------------------------------------------------------------
-- The first migration revoked every function in the public schema, which also
-- caught citext's functions when citext was installed there. Then any insert or
-- update on profiles by a player (setting up a profile, editing it) failed with
-- "permission denied for function texticregexeq" from the username check.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid
    where e.extname = 'citext'
  loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Records and win rates are public unless a player hides them
-- ---------------------------------------------------------------------------

alter table public.profiles add column show_record boolean not null default true;
grant update (show_record) on public.profiles to authenticated;

-- A player's wins and losses (confirmed matches). Hidden ones come back as
-- nulls with hidden = true, except to the player themselves.
create function public.player_stats(p_profile uuid)
returns table (wins bigint, losses bigint, hidden boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.show_record or p.id = auth.uid() then coalesce(r.wins, 0) end,
         case when p.show_record or p.id = auth.uid() then coalesce(r.losses, 0) end,
         not p.show_record
  from public.profiles p
  left join public.player_records r on r.profile_id = p.id
  where p.id = p_profile
    and not public.players_blocked(auth.uid(), p.id);
$$;

-- ---------------------------------------------------------------------------
-- Court lights: whether a court has lights and when they go off
-- ---------------------------------------------------------------------------

alter table public.courts
  add column has_lights boolean,
  add column lights_until smallint check (lights_until between 0 and 24),
  add column lights_updated_by uuid references public.profiles (id) on delete set null,
  add column lights_updated_at timestamptz;

-- Anyone can fix the lights info on a listed court. For a court still waiting
-- for review, only the person who submitted it (or an admin) can.
-- p_until is the hour the lights go off (24 = midnight), or null if unknown.
create function public.set_court_lights(p_court uuid, p_has_lights boolean, p_until smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.courts;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  select * into v_c from public.courts where id = p_court;
  if v_c.id is null or not (v_c.status = 'approved' or v_c.submitted_by = v_me or public.is_admin()) then
    raise exception 'Unknown court';
  end if;
  if p_until is not null and p_until not between 0 and 24 then
    raise exception 'Pick a time between 0 and 24';
  end if;
  update public.courts
  set has_lights = p_has_lights,
      lights_until = case when p_has_lights then p_until end,
      lights_updated_by = v_me,
      lights_updated_at = now()
  where id = p_court;
end;
$$;

revoke execute on function
  public.player_stats(uuid),
  public.set_court_lights(uuid, boolean, smallint)
from public, anon, authenticated;
grant execute on function
  public.player_stats(uuid),
  public.set_court_lights(uuid, boolean, smallint)
to authenticated;
