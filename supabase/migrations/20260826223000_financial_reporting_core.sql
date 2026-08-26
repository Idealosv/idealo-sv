-- IDEALO SV · Reportes y Finanzas: fuente única y conciliable
create or replace view public.financial_cash_monthly
with (security_invoker=true) as
select company_id,date_trunc('month',movement_date)::date period,
 round(sum(case when movement_type in ('INCOME','TRANSFER_IN') and source_type<>'CASH_TRANSFER' then amount else 0 end),2) cash_in,
 round(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') and source_type<>'CASH_TRANSFER' then amount else 0 end),2) cash_out,
 round(sum(case when movement_type in ('INCOME','TRANSFER_IN') and source_type<>'CASH_TRANSFER' then amount when movement_type in ('EXPENSE','TRANSFER_OUT') and source_type<>'CASH_TRANSFER' then -amount else 0 end),2) net_cash
from public.cash_movements group by company_id,date_trunc('month',movement_date)::date;

create or replace view public.financial_receivables_summary
with (security_invoker=true) as
select company_id,
 round(coalesce(sum(amount_total),0),2) invoiced,
 round(coalesce(sum(amount_paid),0),2) collected,
 round(coalesce(sum(balance),0),2) outstanding,
 round(coalesce(sum(case when status='OVERDUE' then balance else 0 end),0),2) overdue,
 count(*) filter(where status not in ('PAID','CANCELLED')) open_accounts
from public.accounts_receivable group by company_id;

create or replace view public.financial_payables_summary
with (security_invoker=true) as
select company_id,
 round(coalesce(sum(amount_total),0),2) purchased,
 round(coalesce(sum(amount_paid),0),2) paid,
 round(coalesce(sum(balance),0),2) outstanding,
 round(coalesce(sum(case when status='OVERDUE' then balance else 0 end),0),2) overdue,
 count(*) filter(where status not in ('PAID','CANCELLED')) open_accounts
from public.accounts_payable group by company_id;

create or replace view public.financial_reconciliation_summary
with (security_invoker=true) as
select company_id,count(*) reconciliations,
 count(*) filter(where status='CLOSED') closed,
 count(*) filter(where status='DIFFERENCE') with_difference,
 round(coalesce(sum(abs(difference)) filter(where status<>'CANCELLED'),0),2) absolute_difference
from public.cash_reconciliations group by company_id;

grant select on public.financial_cash_monthly,public.financial_receivables_summary,public.financial_payables_summary,public.financial_reconciliation_summary to authenticated;
