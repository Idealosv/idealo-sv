create or replace function public.erp_company_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select cm.role::text
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.erp_company_role(uuid) from public;
grant execute on function public.erp_company_role(uuid) to authenticated;

create or replace function public.erp_can_read(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $$ select coalesce(public.erp_company_role(p_company_id) in ('owner','admin','staff','viewer'), false) $$;
revoke all on function public.erp_can_read(uuid) from public;
grant execute on function public.erp_can_read(uuid) to authenticated;

create or replace function public.erp_can_operate(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $$ select coalesce(public.erp_company_role(p_company_id) in ('owner','admin','staff'), false) $$;
revoke all on function public.erp_can_operate(uuid) from public;
grant execute on function public.erp_can_operate(uuid) to authenticated;

create or replace function public.erp_can_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $$ select coalesce(public.erp_company_role(p_company_id) in ('owner','admin'), false) $$;
revoke all on function public.erp_can_admin(uuid) from public;
grant execute on function public.erp_can_admin(uuid) to authenticated;

do $$
declare r record;
begin
  for r in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename = any(array[
      'clients','quotes','quote_items','work_orders','production_tasks','inventory_items','inventory_movements',
      'suppliers','purchases','purchase_items','cash_accounts','cash_movements','expenses','accounts_payable',
      'accounts_receivable','dte_documents','company_members','company_admin_audit'])
  loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;

alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.work_orders enable row level security;
alter table public.production_tasks enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.dte_documents enable row level security;
alter table public.company_members enable row level security;
alter table public.company_admin_audit enable row level security;

create policy company_members_read_company on public.company_members for select to authenticated using (public.erp_can_read(company_id));
create policy company_admin_audit_read_admin on public.company_admin_audit for select to authenticated using (public.erp_can_admin(company_id));

create policy clients_read on public.clients for select to authenticated using (public.erp_can_read(company_id));
create policy clients_insert on public.clients for insert to authenticated with check (public.erp_can_operate(company_id) and created_by=auth.uid());
create policy clients_update on public.clients for update to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy clients_delete on public.clients for delete to authenticated using (public.erp_can_admin(company_id));

create policy quotes_read on public.quotes for select to authenticated using (public.erp_can_read(company_id));
create policy quotes_write on public.quotes for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy quote_items_read on public.quote_items for select to authenticated using (exists(select 1 from public.quotes q where q.id=quote_items.quote_id and public.erp_can_read(q.company_id)));
create policy quote_items_write on public.quote_items for all to authenticated using (exists(select 1 from public.quotes q where q.id=quote_items.quote_id and public.erp_can_operate(q.company_id))) with check (exists(select 1 from public.quotes q where q.id=quote_items.quote_id and public.erp_can_operate(q.company_id)));

create policy work_orders_read on public.work_orders for select to authenticated using (public.erp_can_read(company_id));
create policy work_orders_write on public.work_orders for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy production_tasks_read on public.production_tasks for select to authenticated using (public.erp_can_read(company_id));
create policy production_tasks_write on public.production_tasks for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

create policy inventory_items_read on public.inventory_items for select to authenticated using (public.erp_can_read(company_id));
create policy inventory_items_write on public.inventory_items for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy inventory_movements_read on public.inventory_movements for select to authenticated using (public.erp_can_read(company_id));
create policy inventory_movements_write on public.inventory_movements for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

create policy suppliers_read on public.suppliers for select to authenticated using (public.erp_can_read(company_id));
create policy suppliers_write on public.suppliers for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy purchases_read on public.purchases for select to authenticated using (public.erp_can_read(company_id));
create policy purchases_write on public.purchases for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy purchase_items_read on public.purchase_items for select to authenticated using (public.erp_can_read(company_id));
create policy purchase_items_write on public.purchase_items for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

create policy cash_accounts_read on public.cash_accounts for select to authenticated using (public.erp_can_read(company_id));
create policy cash_accounts_write on public.cash_accounts for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy cash_movements_read on public.cash_movements for select to authenticated using (public.erp_can_read(company_id));
create policy cash_movements_write on public.cash_movements for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy expenses_read on public.expenses for select to authenticated using (public.erp_can_read(company_id));
create policy expenses_write on public.expenses for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy accounts_payable_read on public.accounts_payable for select to authenticated using (public.erp_can_read(company_id));
create policy accounts_payable_write on public.accounts_payable for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy accounts_receivable_read on public.accounts_receivable for select to authenticated using (public.erp_can_read(company_id));
create policy accounts_receivable_write on public.accounts_receivable for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

create policy dte_documents_read on public.dte_documents for select to authenticated using (public.erp_can_read(company_id));
create policy dte_documents_write on public.dte_documents for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));