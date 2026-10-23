-- PRESTADITO$ / IDEALO SV
-- Modelo de permisos del vertical:
-- OWNER / ADMIN / OPERATOR / READ_ONLY.
-- Los roles se originan en company_members de IDEALO SV.
-- staff/operator => OPERATOR; cualquier otro miembro autorizado => READ_ONLY.

create or replace function public.inv_company_access_level(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path='public'
as $$
  select case lower(coalesce(cm.role,''))
    when 'owner' then 'OWNER'
    when 'admin' then 'ADMIN'
    when 'staff' then 'OPERATOR'
    when 'operator' then 'OPERATOR'
    else 'READ_ONLY'
  end
  from public.company_members cm
  where cm.company_id=p_company_id
    and cm.user_id=auth.uid()
    and public.inv_company_member(p_company_id)
  limit 1
$$;

create or replace function public.inv_company_can_operate(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select coalesce(public.inv_company_access_level(p_company_id),'') in ('OWNER','ADMIN','OPERATOR')
$$;

create or replace function public.inv_company_can_submit(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select public.inv_company_can_operate(p_company_id)
$$;

revoke all on function public.inv_company_access_level(uuid) from public;
revoke all on function public.inv_company_can_operate(uuid) from public;
revoke all on function public.inv_company_can_submit(uuid) from public;
grant execute on function public.inv_company_access_level(uuid) to authenticated,service_role;
grant execute on function public.inv_company_can_operate(uuid) to authenticated,service_role;
grant execute on function public.inv_company_can_submit(uuid) to authenticated,service_role;

-- Expedientes: Operador puede crear/editar; Solo lectura no puede mutar.
drop policy if exists inv_member_insert on public.inv_investors;
drop policy if exists inv_member_update on public.inv_investors;
drop policy if exists inv_member_delete on public.inv_investors;
drop policy if exists inv_investor_insert on public.inv_investors;
drop policy if exists inv_investor_update on public.inv_investors;

create policy inv_investor_insert on public.inv_investors
for insert to authenticated
with check(public.inv_company_can_operate(company_id));

create policy inv_investor_update on public.inv_investors
for update to authenticated
using(public.inv_company_can_operate(company_id))
with check(public.inv_company_can_operate(company_id));

revoke delete on public.inv_investors from authenticated;

-- Auditoría: los usuarios operativos pueden agregar trazabilidad,
-- pero nadie autenticado la edita o elimina directamente.
drop policy if exists inv_member_insert on public.inv_audit_log;
drop policy if exists inv_member_update on public.inv_audit_log;
drop policy if exists inv_member_delete on public.inv_audit_log;
drop policy if exists inv_audit_insert on public.inv_audit_log;

create policy inv_audit_insert on public.inv_audit_log
for insert to authenticated
with check(public.inv_company_can_operate(company_id));

revoke update,delete on public.inv_audit_log from authenticated;

-- Storage privado: lectura para cualquier miembro habilitado;
-- carga/reemplazo/borrado solo para usuarios operativos.
drop policy if exists investor_documents_insert on storage.objects;
drop policy if exists investor_documents_update on storage.objects;
drop policy if exists investor_documents_delete on storage.objects;

create policy investor_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='investor-documents'
  and public.inv_company_can_operate((split_part(name,'/',1))::uuid)
);

create policy investor_documents_update on storage.objects
for update to authenticated
using (
  bucket_id='investor-documents'
  and public.inv_company_can_operate((split_part(name,'/',1))::uuid)
)
with check (
  bucket_id='investor-documents'
  and public.inv_company_can_operate((split_part(name,'/',1))::uuid)
);

create policy investor_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id='investor-documents'
  and public.inv_company_can_operate((split_part(name,'/',1))::uuid)
);

comment on function public.inv_company_access_level(uuid) is
'Prestadito$: owner=>OWNER, admin=>ADMIN, staff/operator=>OPERATOR, otros miembros=>READ_ONLY.';
