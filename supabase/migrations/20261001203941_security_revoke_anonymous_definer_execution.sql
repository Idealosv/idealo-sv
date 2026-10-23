-- IDEALO SV security closeout: remove anonymous execution of privileged SECURITY DEFINER RPCs.
-- Applied to Supabase as migration 20261001203941.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from public, anon', r.signature);
  end loop;
end
$$;

-- This eligibility check is used by authenticated IDEALO BAR sessions.
grant execute on function public.bar_company_is_eligible(uuid) to authenticated, service_role;

-- Future Data API access must be granted explicitly.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
