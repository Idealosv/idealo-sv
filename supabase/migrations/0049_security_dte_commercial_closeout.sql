-- Cierre de seguridad multiempresa, DTE y coherencia comercial SaaS.

-- 1) El plan Profesional comercial se ofrece con hasta 5 usuarios.
update public.saas_plans
set max_users = 5,
    updated_at = now()
where code = 'PRO';

-- 2) La secuencia fiscal solo se manipula a través de la función controlada.
--    Una política explícita elimina la ambigüedad de una tabla con RLS sin políticas.
drop policy if exists dte_control_sequences_no_direct_access on public.dte_control_sequences;
create policy dte_control_sequences_no_direct_access
on public.dte_control_sequences
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.dte_control_sequences from anon, authenticated;

-- 3) Corregir políticas hijas de Clientes: antes comparaban c.company_id = c.company_id,
--    lo cual no validaba que el registro hijo perteneciera a la misma empresa del cliente.
drop policy if exists client_addresses_insert on public.client_addresses;
create policy client_addresses_insert on public.client_addresses
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_addresses.client_id
      and c.company_id = client_addresses.company_id
  )
);

drop policy if exists client_addresses_update on public.client_addresses;
create policy client_addresses_update on public.client_addresses
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_addresses.client_id
      and c.company_id = client_addresses.company_id
  )
);

drop policy if exists client_contacts_insert on public.client_contacts;
create policy client_contacts_insert on public.client_contacts
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_contacts.client_id
      and c.company_id = client_contacts.company_id
  )
);

drop policy if exists client_contacts_update on public.client_contacts;
create policy client_contacts_update on public.client_contacts
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_contacts.client_id
      and c.company_id = client_contacts.company_id
  )
);

drop policy if exists client_credit_profiles_insert on public.client_credit_profiles;
create policy client_credit_profiles_insert on public.client_credit_profiles
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_credit_profiles.client_id
      and c.company_id = client_credit_profiles.company_id
  )
);

drop policy if exists client_credit_profiles_update on public.client_credit_profiles;
create policy client_credit_profiles_update on public.client_credit_profiles
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_credit_profiles.client_id
      and c.company_id = client_credit_profiles.company_id
  )
);

drop policy if exists client_interactions_insert on public.client_interactions;
create policy client_interactions_insert on public.client_interactions
for insert to authenticated
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_interactions.client_id
      and c.company_id = client_interactions.company_id
  )
);

drop policy if exists client_interactions_update on public.client_interactions;
create policy client_interactions_update on public.client_interactions
for update to authenticated
using (public.erp_can_operate(company_id))
with check (
  public.erp_can_operate(company_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_interactions.client_id
      and c.company_id = client_interactions.company_id
  )
);

-- 4) La historia de CRM también debe corresponder a la misma empresa de la oportunidad.
drop policy if exists crm_stage_history_insert_company on public.crm_opportunity_stage_history;
create policy crm_stage_history_insert_company on public.crm_opportunity_stage_history
for insert to authenticated
with check (
  public.is_company_member(company_id)
  and exists (
    select 1 from public.crm_opportunities o
    where o.id = crm_opportunity_stage_history.opportunity_id
      and o.company_id = crm_opportunity_stage_history.company_id
  )
);

-- 5) Entitlement DTE a nivel de base de datos. El acceso legacy sin suscripción se conserva,
--    pero una empresa SaaS con plan sin DTE no puede crear ni convertir documentos DTE.
create or replace function public.saas_enforce_dte_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demo boolean := false;
  v_has_subscription boolean := false;
  v_allowed boolean := false;
begin
  select coalesce(c.demo_mode,false)
    into v_demo
    from public.companies c
   where c.id = new.company_id;

  if not found then
    raise exception 'COMPANY_NOT_FOUND';
  end if;

  if v_demo and new.environment = 'production' then
    raise exception 'DEMO_DTE_PRODUCTION_FORBIDDEN';
  end if;

  select true,
         coalesce(p.dte_enabled,false)
         and (
           s.status in ('trial','active')
           or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at >= now())
         )
    into v_has_subscription, v_allowed
    from public.saas_company_subscriptions s
    join public.saas_plans p on p.id = s.plan_id
   where s.company_id = new.company_id
   limit 1;

  -- Empresas legacy todavía sin suscripción conservan acceso durante la migración SaaS.
  if not coalesce(v_has_subscription,false) then
    return new;
  end if;

  if not coalesce(v_allowed,false) then
    raise exception 'SAAS_DTE_PLAN_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.saas_enforce_dte_entitlement() from public, anon, authenticated;
grant execute on function public.saas_enforce_dte_entitlement() to service_role, postgres;

drop trigger if exists trg_saas_dte_entitlement_insert on public.dte_documents;
create trigger trg_saas_dte_entitlement_insert
before insert on public.dte_documents
for each row execute function public.saas_enforce_dte_entitlement();

drop trigger if exists trg_saas_dte_entitlement_environment on public.dte_documents;
create trigger trg_saas_dte_entitlement_environment
before update of company_id, environment on public.dte_documents
for each row execute function public.saas_enforce_dte_entitlement();
