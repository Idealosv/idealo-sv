-- IDEALO SV 1.0: índices de apoyo para relaciones de uso frecuente.
-- No cambia datos, roles ni políticas RLS.

create index if not exists company_admin_audit_actor_user_idx
  on public.company_admin_audit(actor_user_id);
create index if not exists company_admin_audit_target_user_idx
  on public.company_admin_audit(target_user_id);

create index if not exists customer_payment_reversals_cash_account_idx
  on public.customer_payment_reversals(cash_account_id);

create index if not exists dte_contingency_batches_company_idx
  on public.dte_contingency_batches(company_id);
create index if not exists dte_fiscal_events_company_idx
  on public.dte_fiscal_events(company_id);

create index if not exists expenses_cash_account_fkey_idx
  on public.expenses(cash_account_id);
create index if not exists purchases_cash_account_fkey_idx
  on public.purchases(cash_account_id);

create index if not exists saas_billing_events_subscription_idx
  on public.saas_billing_events(subscription_id);
create index if not exists saas_company_subscriptions_plan_idx
  on public.saas_company_subscriptions(plan_id);
create index if not exists saas_company_subscriptions_vertical_idx
  on public.saas_company_subscriptions(vertical_id);
create index if not exists saas_payment_reminders_company_idx
  on public.saas_payment_reminders(company_id);
create index if not exists saas_plan_change_requests_subscription_idx
  on public.saas_plan_change_requests(subscription_id);
create index if not exists saas_plan_change_requests_current_plan_idx
  on public.saas_plan_change_requests(current_plan_id);
create index if not exists saas_plan_change_requests_requested_plan_idx
  on public.saas_plan_change_requests(requested_plan_id);
create index if not exists saas_plan_modules_module_idx
  on public.saas_plan_modules(module_id);
create index if not exists saas_vertical_modules_module_idx
  on public.saas_vertical_modules(module_id);
