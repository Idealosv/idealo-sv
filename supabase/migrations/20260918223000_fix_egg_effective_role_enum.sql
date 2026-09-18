-- Fix enum cast for company_members.role in IDEALO Eggs role resolution.
create or replace function public.egg_effective_role(p_company_id uuid,p_user_id uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path='public'
as $$
declare v_company_role text; v_egg_role text;
begin
  select lower(role::text) into v_company_role
  from public.company_members
  where company_id=p_company_id and user_id=p_user_id;

  if v_company_role is null then return null; end if;
  if v_company_role='owner' then return 'OWNER'; end if;
  if v_company_role='admin' then return 'MANAGER'; end if;

  select role into v_egg_role
  from public.egg_user_roles
  where company_id=p_company_id and user_id=p_user_id;

  if v_egg_role is not null then return v_egg_role; end if;
  if v_company_role='viewer' then return 'VIEWER'; end if;
  return 'SALES';
end;
$$;

grant execute on function public.egg_effective_role(uuid,uuid) to authenticated,service_role;
