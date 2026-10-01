-- Minimal stand-in for Supabase's auth schema so migrations can be tested on
-- plain Postgres. Not used in production.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to public;
