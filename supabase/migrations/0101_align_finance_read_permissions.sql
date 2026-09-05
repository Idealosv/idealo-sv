create or replace function public.erp_can_read_finance(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.erp_company_role(p_company_id) in ('owner','admin','viewer')
$$;

revoke all on function public.erp_can_read_finance(uuid) from public;
grant execute on function public.erp_can_read_finance(uuid) to authenticated;

alter table public.cash_accounts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.accounts_receivable enable row level security;

drop policy if exists cash_accounts_read on public.cash_accounts;
create policy cash_accounts_read on public.cash_accounts for select to authenticated using (public.erp_can_read_finance(company_id));

drop policy if exists cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements for select to authenticated using (public.erp_can_read_finance(company_id));

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated using (public.erp_can_read_finance(company_id));

drop policy if exists accounts_payable_read on public.accounts_payable;
create policy accounts_payable_read on public.accounts_payable for select to authenticated using (public.erp_can_read_finance(company_id));

drop policy if exists accounts_receivable_read on public.accounts_receivable;
create policy accounts_receivable_read on public.accounts_receivable for select to authenticated using (public.erp_can_read_finance(company_id));
