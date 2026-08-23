-- IDEALO SV · Caja/Bancos -> conciliación -> flujo de efectivo
create table if not exists public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  reconciliation_date date not null default current_date,
  system_balance numeric(12,2) not null,
  statement_balance numeric(12,2) not null,
  difference numeric(12,2) generated always as (round((statement_balance-system_balance)::numeric,2)) stored,
  status text not null default 'PENDING' check (status in ('PENDING','MATCHED','DIFFERENCE','CANCELLED')),
  reference text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,cash_account_id,reconciliation_date)
);
create index if not exists cash_reconciliations_company_idx on public.cash_reconciliations(company_id,reconciliation_date desc);
alter table public.cash_reconciliations enable row level security;
drop policy if exists "members manage cash reconciliations" on public.cash_reconciliations;
create policy "members manage cash reconciliations" on public.cash_reconciliations for all to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
grant select,insert,update,delete on public.cash_reconciliations to authenticated;

create or replace view public.cash_account_balances as
select a.id cash_account_id,a.company_id,a.name,a.account_type,a.opening_balance,a.active,
 round((a.opening_balance+coalesce(sum(case when m.movement_type in ('INCOME','TRANSFER_IN') then m.amount when m.movement_type in ('EXPENSE','TRANSFER_OUT') then -m.amount when m.movement_type='ADJUSTMENT' then m.amount else 0 end),0))::numeric,2) current_balance,
 round(coalesce(sum(case when m.movement_date::date=current_date and m.movement_type in ('INCOME','TRANSFER_IN') then m.amount else 0 end),0)::numeric,2) income_today,
 round(coalesce(sum(case when m.movement_date::date=current_date and m.movement_type in ('EXPENSE','TRANSFER_OUT') then m.amount else 0 end),0)::numeric,2) expense_today
from public.cash_accounts a left join public.cash_movements m on m.cash_account_id=a.id and m.company_id=a.company_id
group by a.id,a.company_id,a.name,a.account_type,a.opening_balance,a.active;
grant select on public.cash_account_balances to authenticated;

create or replace function public.reconcile_cash_account(p_cash_account uuid,p_statement_balance numeric,p_date date default current_date,p_reference text default null,p_notes text default null)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare a public.cash_accounts%rowtype; v_system numeric(12,2); v_id uuid; v_status text;
begin
  select * into a from public.cash_accounts where id=p_cash_account;
  if not found then raise exception 'Cuenta de caja o banco no encontrada'; end if;
  if not public.is_company_member(a.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  select round((a.opening_balance+coalesce(sum(case when m.movement_type in ('INCOME','TRANSFER_IN') then m.amount when m.movement_type in ('EXPENSE','TRANSFER_OUT') then -m.amount when m.movement_type='ADJUSTMENT' then m.amount else 0 end),0))::numeric,2)
    into v_system from public.cash_movements m where m.cash_account_id=a.id and m.company_id=a.company_id and m.movement_date::date<=p_date;
  v_system:=coalesce(v_system,a.opening_balance);
  v_status:=case when abs(coalesce(p_statement_balance,0)-v_system)<0.01 then 'MATCHED' else 'DIFFERENCE' end;
  insert into public.cash_reconciliations(company_id,cash_account_id,reconciliation_date,system_balance,statement_balance,status,reference,notes)
  values(a.company_id,a.id,p_date,v_system,p_statement_balance,v_status,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''))
  on conflict(company_id,cash_account_id,reconciliation_date) do update set system_balance=excluded.system_balance,statement_balance=excluded.statement_balance,status=excluded.status,reference=excluded.reference,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.reconcile_cash_account(uuid,numeric,date,text,text) from public,anon;
grant execute on function public.reconcile_cash_account(uuid,numeric,date,text,text) to authenticated;