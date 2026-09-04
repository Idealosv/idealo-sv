create or replace function public.refresh_receivable_balance(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric(12,2);
  v_total numeric(12,2);
  v_due date;
begin
  select coalesce(sum(cp.amount),0)
    into v_paid
  from public.customer_payments cp
  where cp.receivable_id=target_id
    and not exists (
      select 1 from public.customer_payment_reversals r where r.payment_id=cp.id
    );

  select amount_total,due_date into v_total,v_due
  from public.accounts_receivable
  where id=target_id;

  if not found then return; end if;

  update public.accounts_receivable
  set amount_paid=least(coalesce(v_paid,0),amount_total),
      status=case
        when coalesce(v_paid,0)>=v_total then 'PAID'
        when coalesce(v_paid,0)>0 then 'PARTIAL'
        when v_due is not null and v_due<current_date then 'OVERDUE'
        else 'OPEN'
      end,
      updated_at=now()
  where id=target_id and status<>'CANCELLED';
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.accounts_receivable loop
    perform public.refresh_receivable_balance(r.id);
  end loop;
end;
$$;
