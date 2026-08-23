-- Auditoría maestra 2026-08-23: seguridad y rendimiento sin alterar datos de negocio.

-- La vista de saldos debe respetar RLS/permisos del usuario que consulta.
alter view public.cash_account_balances set (security_invoker = true);

-- Los triggers no deben resolver objetos mediante un search_path mutable.
alter function public.sync_dte_mh_receipt_fields() set search_path = '';

-- Funciones internas: no deben exponerse como RPC al cliente.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Helper RLS: nunca debe ser invocable anónimamente.
revoke execute on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

-- RPC antiguo de onboarding. El frontend actual utiliza create_company(text).
revoke execute on function public.create_company_with_owner(text,text) from public, anon, authenticated;
grant execute on function public.create_company_with_owner(text,text) to service_role;

-- Elimina políticas duplicadas de Clientes y conserva una sola política por operación.
drop policy if exists "Administradores pueden eliminar clientes" on public.clients;
drop policy if exists "Miembros pueden actualizar clientes" on public.clients;
drop policy if exists "Miembros pueden crear clientes" on public.clients;
drop policy if exists "Miembros pueden ver clientes" on public.clients;
drop policy if exists members_create_clients on public.clients;
drop policy if exists members_delete_clients on public.clients;
drop policy if exists members_read_clients on public.clients;
drop policy if exists members_update_clients on public.clients;

create policy clients_select_company_members
on public.clients for select to authenticated
using (public.is_company_member(company_id));

create policy clients_insert_company_members
on public.clients for insert to authenticated
with check (
  public.is_company_member(company_id)
  and created_by = (select auth.uid())
);

create policy clients_update_company_members
on public.clients for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy clients_delete_admins
on public.clients for delete to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

-- Índice duplicado exacto: conservar clients_company_name_idx.
drop index if exists public.clients_name_idx;

-- Índices de FK detectados por el linter de Supabase. Se añaden solo los faltantes.
create index if not exists accounts_receivable_client_fkey_idx on public.accounts_receivable(client_id);
create index if not exists accounts_receivable_quote_fkey_idx on public.accounts_receivable(quote_id);
create index if not exists cash_reconciliations_account_fkey_idx on public.cash_reconciliations(cash_account_id);
create index if not exists client_audit_log_client_fkey_idx on public.client_audit_log(client_id);
create index if not exists client_commercial_tasks_client_fkey_idx on public.client_commercial_tasks(client_id);
create index if not exists client_credit_profiles_company_fkey_idx on public.client_credit_profiles(company_id);
create index if not exists client_interactions_client_fkey_idx on public.client_interactions(client_id);
create index if not exists clients_created_by_fkey_idx on public.clients(created_by);
create index if not exists companies_created_by_fkey_idx on public.companies(created_by);
create index if not exists crm_opportunities_client_fkey_idx on public.crm_opportunities(client_id);
create index if not exists crm_opportunities_owner_fkey_idx on public.crm_opportunities(owner_user_id);
create index if not exists crm_stage_history_company_fkey_idx on public.crm_opportunity_stage_history(company_id);
create index if not exists crm_stage_history_changed_by_fkey_idx on public.crm_opportunity_stage_history(changed_by);
create index if not exists customer_payments_cash_account_fkey_idx on public.customer_payments(cash_account_id);
create index if not exists customer_payments_client_fkey_idx on public.customer_payments(client_id);
create index if not exists deliveries_client_fkey_idx on public.deliveries(client_id);
create index if not exists design_approvals_company_fkey_idx on public.design_approvals(company_id);
create index if not exists design_approvals_approved_by_fkey_idx on public.design_approvals(approved_by);
create index if not exists dte_documents_client_fkey_idx on public.dte_documents(client_id);
create index if not exists dte_documents_created_by_fkey_idx on public.dte_documents(created_by);
create index if not exists dte_test_completed_document_fkey_idx on public.dte_test_scenarios(completed_document_id);
create index if not exists employee_commissions_company_fkey_idx on public.employee_commissions(company_id);
create index if not exists employee_commissions_work_order_fkey_idx on public.employee_commissions(work_order_id);
create index if not exists expenses_supplier_fkey_idx on public.expenses(supplier_id);
create index if not exists labor_allocations_company_fkey_idx on public.labor_allocations(company_id);
create index if not exists mobile_push_company_fkey_idx on public.mobile_push_subscriptions(company_id);
create index if not exists payroll_items_company_fkey_idx on public.payroll_items(company_id);
create index if not exists schedule_assignments_employee_fkey_idx on public.production_schedule_assignments(employee_id);
create index if not exists schedule_events_delivery_fkey_idx on public.production_schedule_events(delivery_id);
create index if not exists purchase_items_company_fkey_idx on public.purchase_items(company_id);
create index if not exists purchase_items_work_order_fkey_idx on public.purchase_items(work_order_id);
create index if not exists purchase_receipt_lines_company_fkey_idx on public.purchase_receipt_lines(company_id);
create index if not exists purchase_receipt_lines_item_fkey_idx on public.purchase_receipt_lines(inventory_item_id);
create index if not exists purchase_receipt_lines_movement_fkey_idx on public.purchase_receipt_lines(inventory_movement_id);
create index if not exists purchase_receipts_created_by_fkey_idx on public.purchase_receipts(created_by);
create index if not exists purchases_supplier_fkey_idx on public.purchases(supplier_id);
create index if not exists quality_checks_employee_fkey_idx on public.quality_checks(checked_by_employee_id);
create index if not exists quality_checks_work_order_fkey_idx on public.quality_checks(work_order_id);
create index if not exists quality_incidents_check_fkey_idx on public.quality_incidents(quality_check_id);
create index if not exists quality_incidents_reporter_fkey_idx on public.quality_incidents(reported_by_employee_id);
create index if not exists quality_incidents_work_order_fkey_idx on public.quality_incidents(work_order_id);
create index if not exists quote_attachments_created_by_fkey_idx on public.quote_attachments(created_by);
create index if not exists quote_communications_created_by_fkey_idx on public.quote_communications(created_by);
create index if not exists quote_status_history_changed_by_fkey_idx on public.quote_status_history(changed_by);
create index if not exists quote_versions_created_by_fkey_idx on public.quote_versions(created_by);
create index if not exists work_order_costs_employee_fkey_idx on public.work_order_costs(employee_id);
create index if not exists work_order_evidence_created_by_fkey_idx on public.work_order_evidence(created_by);
create index if not exists work_order_evidence_delivery_fkey_idx on public.work_order_evidence(delivery_id);
create index if not exists work_order_evidence_order_fkey_idx on public.work_order_evidence(work_order_id);
create index if not exists work_order_items_order_fkey_idx on public.work_order_items(work_order_id);
