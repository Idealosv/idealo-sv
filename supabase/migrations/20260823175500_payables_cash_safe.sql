-- IDEALO SV · Compra recibida -> Cuentas por pagar -> Caja
-- Alinea CxP con el ciclo de recepción y hace los pagos idempotentes.

alter table public.supplier_payments
  add column if not exists payment_key uuid;

create unique index if not exists supplier_payments_payment_key_uidx
  on public.supplier_payments(company_id,payment_key)
  where payment_key is not null;

create unique index if not exists cash_movements_supplier_payment_uidx
  on public.cash_movements(company_id,source_type,source_id)
  where source_type='SUPPLIER_PAYMENT' and source_id is not null;

create or replace function public.sync_purchase_to_payable() returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_status text:=coalesce(new.procurement_status,'REGISTERED');
  v_eligible boolean;
begin
  v_eligible:=new.payment_status in ('PENDING','PARTIAL')
    and new.total>0
    and v_status in ('REGISTERED','RECEIVED');

  if v_eligible then
    insert into public.accounts_payable(company_id,supplier_id,purchase_id,concept,amount_total,due_date,status)
    values(new.company_id,new.supplier_id,new.id,new.concept,new.total,new.due_date,
      case when new.due_date is not null and new.due_date<current_date then 'OVERDUE' else 'OPEN' end)
    on conflict (purchase_id) where purchase_id is not null do update
      set supplier_id=excluded.supplier_id,
          concept=excluded.concept,
          amount_total=excluded.amount_total,
          due_date=excluded.due_date,
          status=case
            when public.accounts_payable.amount_paid>=excluded.amount_total then 'PAID'
            when public.accounts_payable.amount_paid>0 then 'PARTIAL'
            when excluded.due_date is not null and excluded.due_date<current_date then 'OVERDUE'
            else 'OPEN' end,
          updated_at=now();
  elsif new.payment_status='PAID' then
    update public.accounts_payable
      set amount_paid=amount_total,status='PAID',updated_at=now()
      where purchase_id=new.id;
  elsif v_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED','CANCELLED') then
    delete from public.accounts_payable
      where purchase_id=new.id and amount_paid=0;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_purchase_to_payable() from public,anon,authenticated;

drop trigger if exists trg_sync_purchase_to_payable on public.purchases;
create trigger trg_sync_purchase_to_payable
after insert or update of payment_status,total,due_date,supplier_id,concept,procurement_status on public.purchases
for each row execute function public.sync_purchase_to_payable();

create or replace function public.apply_supplier_payment() returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_purchase uuid;
  v_due date;
  v_supplier uuid;
begin
  select amount_total,purchase_id,due_date,supplier_id
    into v_total,v_purchase,v_due,v_supplier
  from public.accounts_payable
  where id=new.payable_id and company_id=new.company_id
  for update;

  if not found then raise exception 'La cuenta por pagar no pertenece a esta empresa'; end if;

  select coalesce(sum(amount),0) into v_paid
  from public.supplier_payments where payable_id=new.payable_id;
  if v_paid>v_total+0.001 then raise exception 'El pago excede el saldo de la cuenta por pagar'; end if;

  update public.accounts_payable set
    amount_paid=v_paid,
    status=case when v_paid>=v_total then 'PAID' when v_paid>0 then 'PARTIAL' when v_due is not null and v_due<current_date then 'OVERDUE' else 'OPEN' end,
    updated_at=now()
  where id=new.payable_id;

  if v_purchase is not null then
    update public.purchases set
      payment_status=case when v_paid>=v_total then 'PAID' when v_paid>0 then 'PARTIAL' else 'PENDING' end,
      updated_at=now()
    where id=v_purchase and company_id=new.company_id;
  end if;

  insert into public.cash_movements(
    company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes
  ) values(
    new.company_id,new.cash_account_id,new.paid_at,'EXPENSE','SUPPLIER_PAYMENT',new.id,
    'Pago a proveedor',new.amount,new.reference,new.notes
  ) on conflict (company_id,source_type,source_id)
    where source_type='SUPPLIER_PAYMENT' and source_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.apply_supplier_payment() from public,anon,authenticated;

drop trigger if exists trg_apply_supplier_payment on public.supplier_payments;
create trigger trg_apply_supplier_payment
after insert on public.supplier_payments
for each row execute function public.apply_supplier_payment();

create or replace function public.register_supplier_payment(
  p_payable uuid,
  p_cash_account uuid,
  p_amount numeric,
  p_payment_method text default 'CASH',
  p_reference text default null,
  p_notes text default null,
  p_payment_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  ap public.accounts_payable%rowtype;
  v_balance numeric(12,2);
  v_existing uuid;
  v_payment uuid;
begin
  if p_payment_key is null then raise exception 'Falta clave idempotente del pago'; end if;

  select id into v_existing from public.supplier_payments
  where company_id=(select company_id from public.accounts_payable where id=p_payable)
    and payment_key=p_payment_key;
  if v_existing is not null then return v_existing; end if;

  select * into ap from public.accounts_payable where id=p_payable for update;
  if not found then raise exception 'Cuenta por pagar no encontrada'; end if;
  if not public.is_company_member(ap.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if ap.status in ('PAID','CANCELLED') then raise exception 'La cuenta por pagar no admite nuevos pagos'; end if;
  if not exists(select 1 from public.cash_accounts ca where ca.id=p_cash_account and ca.company_id=ap.company_id and ca.active=true) then
    raise exception 'Caja o banco no disponible';
  end if;

  v_balance:=greatest(ap.amount_total-ap.amount_paid,0);
  if coalesce(p_amount,0)<=0 or p_amount>v_balance+0.001 then
    raise exception 'Monto inválido. Saldo disponible: %',v_balance;
  end if;

  insert into public.supplier_payments(
    company_id,payable_id,supplier_id,cash_account_id,amount,payment_method,reference,notes,payment_key
  ) values(
    ap.company_id,ap.id,ap.supplier_id,p_cash_account,p_amount,
    coalesce(nullif(p_payment_method,''),'CASH'),nullif(trim(p_reference),''),nullif(trim(p_notes),''),p_payment_key
  ) returning id into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.register_supplier_payment(uuid,uuid,numeric,text,text,text,uuid) from public,anon;
grant execute on function public.register_supplier_payment(uuid,uuid,numeric,text,text,text,uuid) to authenticated;

-- Corrige CxP antiguas creadas demasiado temprano por compras operativas aún no recibidas.
delete from public.accounts_payable ap
using public.purchases p
where ap.purchase_id=p.id
  and coalesce(p.procurement_status,'REGISTERED') in ('DRAFT','ORDERED','PARTIAL_RECEIVED','CANCELLED')
  and ap.amount_paid=0;

-- Asegura CxP para compras ya recibidas o compras manuales registradas.
insert into public.accounts_payable(company_id,supplier_id,purchase_id,concept,amount_total,due_date,status)
select p.company_id,p.supplier_id,p.id,p.concept,p.total,p.due_date,
  case when p.due_date is not null and p.due_date<current_date then 'OVERDUE' else 'OPEN' end
from public.purchases p
where p.payment_status in ('PENDING','PARTIAL') and p.total>0
  and coalesce(p.procurement_status,'REGISTERED') in ('REGISTERED','RECEIVED')
on conflict (purchase_id) where purchase_id is not null do nothing;
