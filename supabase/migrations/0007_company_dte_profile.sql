-- IDEALO SV: expediente fiscal del emisor para DTE (sin secretos)

alter table public.companies
  add column if not exists nit text,
  add column if not exists nrc text,
  add column if not exists trade_name text,
  add column if not exists activity_code text,
  add column if not exists business_activity text,
  add column if not exists department_code text,
  add column if not exists municipality_code text,
  add column if not exists district_code text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists establishment_code text,
  add column if not exists point_of_sale_code text;

alter table public.clients
  add column if not exists district_code text;

drop policy if exists "owners_manage_company_fiscal_profile" on public.companies;
create policy "owners_manage_company_fiscal_profile"
on public.companies for update
using (
  exists (
    select 1 from public.company_members
    where company_members.company_id = companies.id
      and company_members.user_id = auth.uid()
      and company_members.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.company_members
    where company_members.company_id = companies.id
      and company_members.user_id = auth.uid()
      and company_members.role in ('owner', 'admin')
  )
);

grant update on table public.companies to authenticated;

comment on column public.companies.nit is 'NIT del emisor DTE';
comment on column public.companies.nrc is 'NRC del emisor DTE';
comment on column public.companies.activity_code is 'CAT-019 actividad económica del emisor';
comment on column public.companies.department_code is 'CAT-012 departamento del emisor';
comment on column public.companies.municipality_code is 'CAT-013 municipio del emisor';
comment on column public.companies.district_code is 'Distrito del domicilio del emisor requerido por DTE v2';
comment on column public.clients.district_code is 'Distrito del domicilio del receptor requerido por DTE v2';

