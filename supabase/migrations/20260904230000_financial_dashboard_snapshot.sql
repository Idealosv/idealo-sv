create or replace function public.financial_dashboard_snapshot(p_company uuid, p_start date, p_end date)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_start date:=coalesce(p_start,current_date);
  v_end date:=coalesce(p_end,current_date);
  v_cash_total numeric(14,2):=0;
  v_cash_available numeric(14,2):=0;
  v_bank_available numeric(14,2):=0;
  v_cash_in numeric(14,2):=0;
  v_cash_out numeric(14,2):=0;
  v_collections numeric(14,2):=0;
  v_advances numeric(14,2):=0;
  v_purchase_out numeric(14,2):=0;
  v_expense_out numeric(14,2):=0;
  v_supplier_out numeric(14,2):=0;
  v_purchases numeric(14,2):=0;
  v_expenses numeric(14,2):=0;
  v_ar numeric(14,2):=0;
  v_ar_overdue numeric(14,2):=0;
  v_ap numeric(14,2):=0;
  v_ap_overdue numeric(14,2):=0;
  v_advance_pending numeric(14,2):=0;
  v_dte_total numeric(14,2):=0;
  v_dte_count bigint:=0;
  v_open_ar bigint:=0;
  v_open_ap bigint:=0;
begin
  if v_start>v_end then raise exception 'La fecha inicial no puede ser posterior a la fecha final'; end if;
  if not public.is_company_member(p_company) then raise exception 'Sin acceso a esta empresa'; end if;

  select
    coalesce(sum(current_balance),0),
    coalesce(sum(current_balance) filter(where upper(account_type) in ('CASH','CAJA','PETTY_CASH')),0),
    coalesce(sum(current_balance) filter(where upper(account_type)='BANK'),0)
  into v_cash_total,v_cash_available,v_bank_available
  from public.cash_account_balances
  where company_id=p_company and active=true;

  select
    coalesce(sum(amount) filter(where movement_type='INCOME'),0),
    coalesce(sum(amount) filter(where movement_type='EXPENSE'),0),
    coalesce(sum(amount) filter(where movement_type='INCOME' and source_type='CUSTOMER_PAYMENT'),0),
    coalesce(sum(amount) filter(where movement_type='INCOME' and source_type='CUSTOMER_ADVANCE'),0),
    coalesce(sum(amount) filter(where movement_type='EXPENSE' and source_type='PURCHASE'),0),
    coalesce(sum(amount) filter(where movement_type='EXPENSE' and source_type='EXPENSE'),0),
    coalesce(sum(amount) filter(where movement_type='EXPENSE' and source_type='SUPPLIER_PAYMENT'),0)
  into v_cash_in,v_cash_out,v_collections,v_advances,v_purchase_out,v_expense_out,v_supplier_out
  from public.cash_movements
  where company_id=p_company
    and movement_date>=v_start::timestamp
    and movement_date<(v_end+1)::timestamp
    and movement_type in ('INCOME','EXPENSE');

  select coalesce(sum(total),0) into v_purchases
  from public.purchases
  where company_id=p_company and voided_at is null and purchase_date between v_start and v_end;

  select coalesce(sum(amount),0) into v_expenses
  from public.expenses
  where company_id=p_company and coalesce(status,'ACTIVE')<>'VOIDED' and expense_date between v_start and v_end;

  select
    coalesce(sum(greatest(amount_total-amount_paid,0)) filter(where status<>'CANCELLED'),0),
    coalesce(sum(greatest(amount_total-amount_paid,0)) filter(where status not in ('PAID','CANCELLED') and due_date<current_date),0),
    count(*) filter(where status not in ('PAID','CANCELLED'))
  into v_ar,v_ar_overdue,v_open_ar
  from public.accounts_receivable where company_id=p_company;

  select
    coalesce(sum(greatest(amount_total-amount_paid,0)) filter(where status<>'CANCELLED'),0),
    coalesce(sum(greatest(amount_total-amount_paid,0)) filter(where status not in ('PAID','CANCELLED') and due_date<current_date),0),
    count(*) filter(where status not in ('PAID','CANCELLED'))
  into v_ap,v_ap_overdue,v_open_ap
  from public.accounts_payable where company_id=p_company;

  select coalesce(sum(greatest(amount-applied_amount,0)) filter(where coalesce(status,'OPEN')<>'CANCELLED'),0)
  into v_advance_pending
  from public.customer_advances where company_id=p_company;

  select
    coalesce(sum(coalesce(nullif(dte_payload#>>'{resumen,totalPagar}','')::numeric,0)),0),
    count(*)
  into v_dte_total,v_dte_count
  from public.dte_documents
  where company_id=p_company
    and status='PROCESSED'
    and environment='01'
    and created_at>=v_start::timestamp
    and created_at<(v_end+1)::timestamp;

  return jsonb_build_object(
    'start_date',v_start,'end_date',v_end,
    'cash_total',round(v_cash_total,2),'cash_available',round(v_cash_available,2),'bank_available',round(v_bank_available,2),
    'cash_in',round(v_cash_in,2),'cash_out',round(v_cash_out,2),'net_cash',round(v_cash_in-v_cash_out,2),
    'customer_collections',round(v_collections,2),'customer_advances',round(v_advances,2),
    'purchase_cash_out',round(v_purchase_out,2),'expense_cash_out',round(v_expense_out,2),'supplier_payment_cash_out',round(v_supplier_out,2),
    'purchases_period',round(v_purchases,2),'expenses_period',round(v_expenses,2),
    'receivables',round(v_ar,2),'receivables_overdue',round(v_ar_overdue,2),'open_receivables',v_open_ar,
    'payables',round(v_ap,2),'payables_overdue',round(v_ap_overdue,2),'open_payables',v_open_ap,
    'pending_advances',round(v_advance_pending,2),
    'accepted_dte_total',round(v_dte_total,2),'accepted_dte_count',v_dte_count,
    'integrity_note','Flujo de caja calculado solo desde movimientos INCOME/EXPENSE. Transferencias internas no se cuentan y compras/gastos se muestran como análisis, no se vuelven a restar.'
  );
end;
$$;

grant execute on function public.financial_dashboard_snapshot(uuid,date,date) to authenticated;
