-- Client 360: align auxiliary tables with ERP roles and enforce company/client integrity.

-- Remove legacy policies that allowed every authenticated company member to write.
drop policy if exists client_contacts_member_all on public.client_contacts;
drop policy if exists client_addresses_member_all on public.client_addresses;
drop policy if exists client_interactions_member_all on public.client_interactions;
drop policy if exists client_credit_profiles_member_all on public.client_credit_profiles;

-- Contacts
create policy client_contacts_read on public.client_contacts
for select to authenticated
using (public.erp_can_read(company_id));

create policy client_contacts_insert on public.client_contacts
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_contacts_update on public.client_contacts
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_contacts_delete on public.client_contacts
for delete to authenticated
using (public.erp_can_operate(company_id));

-- Addresses
create policy client_addresses_read on public.client_addresses
for select to authenticated
using (public.erp_can_read(company_id));

create policy client_addresses_insert on public.client_addresses
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_addresses_update on public.client_addresses
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_addresses_delete on public.client_addresses
for delete to authenticated
using (public.erp_can_operate(company_id));

-- Commercial interactions / follow-ups
create policy client_interactions_read on public.client_interactions
for select to authenticated
using (public.erp_can_read(company_id));

create policy client_interactions_insert on public.client_interactions
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_interactions_update on public.client_interactions
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_interactions_delete on public.client_interactions
for delete to authenticated
using (public.erp_can_operate(company_id));

-- Credit profile
create policy client_credit_profiles_read on public.client_credit_profiles
for select to authenticated
using (public.erp_can_read(company_id));

create policy client_credit_profiles_insert on public.client_credit_profiles
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_credit_profiles_update on public.client_credit_profiles
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.company_id = company_id
  )
);

create policy client_credit_profiles_delete on public.client_credit_profiles
for delete to authenticated
using (public.erp_can_operate(company_id));

-- Business integrity checks for credit data.
alter table public.client_credit_profiles
  drop constraint if exists client_credit_profiles_credit_limit_nonnegative,
  add constraint client_credit_profiles_credit_limit_nonnegative check (credit_limit >= 0);

alter table public.client_credit_profiles
  drop constraint if exists client_credit_profiles_credit_days_nonnegative,
  add constraint client_credit_profiles_credit_days_nonnegative check (credit_days >= 0);

alter table public.client_credit_profiles
  drop constraint if exists client_credit_profiles_blocked_reason_required,
  add constraint client_credit_profiles_blocked_reason_required
  check (not blocked or nullif(btrim(blocked_reason), '') is not null);

-- Defense in depth: never allow an auxiliary row to reference a client from another company.
create or replace function public.enforce_client_company_link()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1
    from public.clients c
    where c.id = new.client_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El cliente no pertenece a la empresa indicada';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_client_company_link() from public;
revoke all on function public.enforce_client_company_link() from anon;
revoke all on function public.enforce_client_company_link() from authenticated;

drop trigger if exists trg_client_contacts_company_link on public.client_contacts;
create trigger trg_client_contacts_company_link
before insert or update of company_id, client_id on public.client_contacts
for each row execute function public.enforce_client_company_link();

drop trigger if exists trg_client_addresses_company_link on public.client_addresses;
create trigger trg_client_addresses_company_link
before insert or update of company_id, client_id on public.client_addresses
for each row execute function public.enforce_client_company_link();

drop trigger if exists trg_client_interactions_company_link on public.client_interactions;
create trigger trg_client_interactions_company_link
before insert or update of company_id, client_id on public.client_interactions
for each row execute function public.enforce_client_company_link();

drop trigger if exists trg_client_credit_profiles_company_link on public.client_credit_profiles;
create trigger trg_client_credit_profiles_company_link
before insert or update of company_id, client_id on public.client_credit_profiles
for each row execute function public.enforce_client_company_link();

-- Make Client 360 audit events appear under the Clientes module.
create or replace function public.erp_audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  v_company_id uuid;
  v_record_id text;
  v_actor uuid := auth.uid();
  v_module text;
  v_changed_fields jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  begin
    v_company_id := nullif(coalesce(v_new->>'company_id', v_old->>'company_id'), '')::uuid;
  exception when others then
    v_company_id := null;
  end;

  if v_company_id is null and tg_table_name = 'quote_items' then
    select q.company_id into v_company_id
    from public.quotes q
    where q.id = coalesce((v_new->>'quote_id')::uuid, (v_old->>'quote_id')::uuid)
    limit 1;
  end if;

  if v_company_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_record_id := coalesce(
    v_new->>'id', v_old->>'id',
    v_new->>'client_id', v_old->>'client_id',
    v_new->>'quote_id', v_old->>'quote_id',
    ''
  );

  v_module := case tg_table_name
    when 'clients' then 'Clientes'
    when 'client_contacts' then 'Clientes'
    when 'client_addresses' then 'Clientes'
    when 'client_interactions' then 'Clientes'
    when 'client_credit_profiles' then 'Clientes'
    when 'quotes' then 'Cotizaciones'
    when 'quote_items' then 'Cotizaciones'
    when 'work_orders' then 'Producción'
    when 'production_tasks' then 'Producción'
    when 'inventory_items' then 'Inventario'
    when 'inventory_movements' then 'Inventario'
    when 'suppliers' then 'Proveedores'
    when 'purchases' then 'Compras'
    when 'purchase_items' then 'Compras'
    when 'cash_accounts' then 'Caja'
    when 'cash_movements' then 'Caja'
    when 'expenses' then 'Finanzas'
    when 'accounts_payable' then 'Finanzas'
    when 'accounts_receivable' then 'Finanzas'
    when 'dte_documents' then 'Facturación'
    else tg_table_name
  end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into v_changed_fields
    from (
      select n.key as k
      from jsonb_each(v_new) n
      left join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value
        and n.key not in ('updated_at','last_activity_at')
    ) s;
  end if;

  insert into public.company_admin_audit(company_id, actor_user_id, target_user_id, action, detail)
  values (
    v_company_id,
    v_actor,
    null,
    case tg_op
      when 'INSERT' then 'ERP_RECORD_CREATED'
      when 'UPDATE' then 'ERP_RECORD_UPDATED'
      else 'ERP_RECORD_DELETED'
    end,
    jsonb_build_object(
      'module', v_module,
      'table', tg_table_name,
      'record_id', v_record_id,
      'operation', tg_op,
      'changed_fields', case when tg_op='UPDATE' then v_changed_fields else '[]'::jsonb end
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
