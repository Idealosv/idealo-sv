-- Varias tablas tenían RLS correcto pero carecían de privilegios SQL básicos para authenticated.
-- RLS sigue siendo la capa que decide qué filas puede operar cada usuario.

grant select,insert,update,delete on table
  public.accounts_receivable,
  public.customer_payments,
  public.deliveries,
  public.finished_products,
  public.mobile_push_subscriptions,
  public.production_schedule_assignments,
  public.production_schedule_events,
  public.quality_checks,
  public.quality_incidents,
  public.quote_items,
  public.work_order_evidence,
  public.work_order_items,
  public.work_orders
  to authenticated;

grant select,insert,update on table
  public.design_approvals,
  public.dte_test_scenarios
  to authenticated;

-- Evita reevaluar auth.uid() fila por fila en políticas de alto tráfico.
alter policy users_read_own_profile on public.profiles
  using ((select auth.uid()) = id);

alter policy users_update_own_profile on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy owners_manage_company_fiscal_profile on public.companies
  using (exists (select 1 from public.company_members cm where cm.company_id=companies.id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))
  with check (exists (select 1 from public.company_members cm where cm.company_id=companies.id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));

alter policy "members can read dte test scenarios" on public.dte_test_scenarios
  using (exists (select 1 from public.company_members cm where cm.company_id=dte_test_scenarios.company_id and cm.user_id=(select auth.uid())));

alter policy "members can insert dte test scenarios" on public.dte_test_scenarios
  with check (exists (select 1 from public.company_members cm where cm.company_id=dte_test_scenarios.company_id and cm.user_id=(select auth.uid())));

alter policy "members can update dte test scenarios" on public.dte_test_scenarios
  using (exists (select 1 from public.company_members cm where cm.company_id=dte_test_scenarios.company_id and cm.user_id=(select auth.uid())));

alter policy "members manage work orders" on public.work_orders
  using (exists (select 1 from public.company_members cm where cm.company_id=work_orders.company_id and cm.user_id=(select auth.uid())))
  with check (exists (select 1 from public.company_members cm where cm.company_id=work_orders.company_id and cm.user_id=(select auth.uid())));

alter policy "members manage work order items" on public.work_order_items
  using (exists (select 1 from public.work_orders w join public.company_members cm on cm.company_id=w.company_id where w.id=work_order_items.work_order_id and cm.user_id=(select auth.uid())))
  with check (exists (select 1 from public.work_orders w join public.company_members cm on cm.company_id=w.company_id where w.id=work_order_items.work_order_id and cm.user_id=(select auth.uid())));

alter policy "members manage deliveries" on public.deliveries
  using (exists (select 1 from public.company_members cm where cm.company_id=deliveries.company_id and cm.user_id=(select auth.uid())))
  with check (exists (select 1 from public.company_members cm where cm.company_id=deliveries.company_id and cm.user_id=(select auth.uid())));

alter policy "members manage receivables" on public.accounts_receivable
  using (exists (select 1 from public.company_members cm where cm.company_id=accounts_receivable.company_id and cm.user_id=(select auth.uid())))
  with check (exists (select 1 from public.company_members cm where cm.company_id=accounts_receivable.company_id and cm.user_id=(select auth.uid())));

alter policy "members manage customer payments" on public.customer_payments
  using (exists (select 1 from public.company_members cm where cm.company_id=customer_payments.company_id and cm.user_id=(select auth.uid())))
  with check (exists (select 1 from public.company_members cm where cm.company_id=customer_payments.company_id and cm.user_id=(select auth.uid())));

alter policy evidence_company_insert on public.work_order_evidence
  with check (public.is_company_member(company_id) and created_by=(select auth.uid()));

alter policy evidence_company_update on public.work_order_evidence
  using (exists (select 1 from public.company_members cm where cm.company_id=work_order_evidence.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));

alter policy evidence_company_delete on public.work_order_evidence
  using (exists (select 1 from public.company_members cm where cm.company_id=work_order_evidence.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));

alter policy mobile_push_own_select on public.mobile_push_subscriptions
  using (user_id=(select auth.uid()) and public.is_company_member(company_id));
alter policy mobile_push_own_insert on public.mobile_push_subscriptions
  with check (user_id=(select auth.uid()) and public.is_company_member(company_id));
alter policy mobile_push_own_update on public.mobile_push_subscriptions
  using (user_id=(select auth.uid()) and public.is_company_member(company_id));
alter policy mobile_push_own_delete on public.mobile_push_subscriptions
  using (user_id=(select auth.uid()) and public.is_company_member(company_id));
