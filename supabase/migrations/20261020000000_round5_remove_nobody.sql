-- Round 5: "Nobody" is gone from Who can challenge you. Turn Looking to Play off
-- instead. Anyone who had picked Nobody becomes Everyone. Safe to run once.

update public.profiles set challenges_from = 'everyone' where challenges_from = 'nobody';

do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%challenges_from%'
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_challenges_from_check check (challenges_from in ('everyone', 'friends'));
