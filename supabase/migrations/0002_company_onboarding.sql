-- IDEALO SV: incorporación segura de la primera empresa
create or replace function public.create_company(company_name text)
returns table (
  id uuid,
  name text,
  slug text,
  role public.company_role
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := pg_catalog.btrim(company_name);
  generated_slug text;
  company_id uuid;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para crear una empresa.';
  end if;

  if pg_catalog.length(clean_name) < 2 then
    raise exception 'El nombre de la empresa debe tener al menos 2 caracteres.';
  end if;

  return query
  select c.id, c.name, c.slug, cm.role
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = current_user_id
  order by c.created_at
  limit 1;

  if found then
    return;
  end if;

  generated_slug :=
    pg_catalog.trim(both '-' from pg_catalog.regexp_replace(
      pg_catalog.lower(clean_name),
      '[^a-z0-9]+',
      '-',
      'g'
    ))
    || '-' || pg_catalog.substring(public.gen_random_uuid()::text from 1 for 8);

  insert into public.companies (name, slug, created_by)
  values (clean_name, generated_slug, current_user_id)
  returning companies.id into company_id;

  insert into public.company_members (company_id, user_id, role)
  values (company_id, current_user_id, 'owner');

  return query
  select c.id, c.name, c.slug, cm.role
  from public.companies c
  join public.company_members cm on cm.company_id = c.id
  where c.id = company_id and cm.user_id = current_user_id;
end;
$$;

create or replace function public.get_my_companies()
returns table (
  id uuid,
  name text,
  slug text,
  role public.company_role
)
language sql
security definer
set search_path = ''
stable
as $$
  select c.id, c.name, c.slug, cm.role
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = auth.uid()
  order by c.created_at;
$$;

revoke all on function public.create_company(text) from public, anon;
revoke all on function public.get_my_companies() from public, anon;
grant execute on function public.create_company(text) to authenticated;
grant execute on function public.get_my_companies() to authenticated;
