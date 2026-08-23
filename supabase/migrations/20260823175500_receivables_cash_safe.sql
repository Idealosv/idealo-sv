-- IDEALO SV · Factura/Cobro -> Cuentas por cobrar -> Caja
alter table public.accounts_receivable add column if not exists dte_document_id uuid references public.dte_documents(id) on delete set null;
create unique index if not exists accounts_receivable_dte_uidx on public.accounts_receivable(dte_document_id) where dte_document_id is not null;
alter table public.customer_payments add column if not exists cash_account_id uuid references public.cash_accounts(id) on delete restrict;
alter table public.customer_payments add column if not exists payment_key uuid;
create unique index if not exists customer_payments_company_key_uidx on public.customer_payments(company_id,payment_key) where payment_key is not null;
create unique index if not exists cash_movements_customer_payment_uidx on public.cash_movements(company_id,source_type,source_id) where source_type='CUSTOMER_PAYMENT' and source_id is not null;

create or replace function public.sync_dte_to_receivable() returns trigger language plpgsql security invoker set search_path='public' as $$
declare v_total numeric(12,2); v_condition integer; v_due date; v_period integer;
begin
  if new.status <> 'PROCESSED' or new.dte_type not in ('01','03') then return new; end if;
  v_condition:=coalesce((new.dte_payload#>>'{resumen,condicionOperacion}')::integer,1);
  if v_condition<>2 then return new; end if;
  v_total:=coalesce((new.dte_payload#>>'{resumen,totalPagar}')::numeric,0);
  if v_total<=0 then return new; end if;
  begin v_period:=nullif(new.dte_payload#>>'{resumen,pagos,0,periodo}','')::integer; exception when others then v_period:=null; end;
  v_due:=coalesce((new.dte_payload#>>'{identificacion,fecEmi}')::date,current_date)+coalesce(v_period,30);
  insert into public.accounts_receivable(company_id,client_id,dte_document_id,concept,amount_total,due_date,status)
  values(new.company_id,new.client_id,new.id,'DTE-'||new.dte_type||' · '||new.control_number,v_total,v_due,case when v_due<current_date then 'OVERDUE' else 'OPEN' end)
  on conflict (dte_document_id) where dte_document_id is not null do update set client_id=excluded.client_id,concept=excluded.concept,amount_total=excluded.amount_total,due_date=excluded.due_date,updated_at=now();
  return new;
end; $$;
revoke all on function public.sync_dte_to_receivable() from public,anon,authenticated;
drop trigger if exists trg_sync_dte_to_receivable on public.dte_documents;
create trigger trg_sync_dte_to_receivable after insert or update of status,dte_payload,client_id on public.dte_documents for each row execute function public.sync_dte_to_receivable();

create or replace function public.apply_customer_payment_cash() returns trigger language plpgsql security invoker set search_path='public' as $$
declare r public.accounts_receivable%rowtype;
begin
  select * into r from public.accounts_receivable where id=new.receivable_id and company_id=new.company_id;
  if not found then raise exception 'Cuenta por cobrar inválida'; end if;
  if new.cash_account_id is null then raise exception 'Seleccioná la caja o banco donde ingresó el cobro'; end if;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,new.cash_account_id,new.paid_at,'INCOME','CUSTOMER_PAYMENT',new.id,'Cobro cliente · CXC-'||r.number,new.amount,new.reference,new.notes)
  on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_PAYMENT' and source_id is not null do nothing;
  return new;
end; $$;
revoke all on function public.apply_customer_payment_cash() from public,anon,authenticated;
drop trigger if exists trg_apply_customer_payment_cash on public.customer_payments;
create trigger trg_apply_customer_payment_cash after insert on public.customer_payments for each row execute function public.apply_customer_payment_cash();

create or replace function public.register_customer_payment(p_receivable uuid,p_cash_account uuid,p_amount numeric,p_payment_method text default 'CASH',p_reference text default null,p_notes text default null,p_payment_key uuid default gen_random_uuid()) returns uuid
language plpgsql security invoker set search_path='public' as $$
declare r public.accounts_receivable%rowtype; c public.cash_accounts%rowtype; v_balance numeric(12,2); v_existing uuid; v_payment uuid;
begin
  if coalesce(p_amount,0)<=0 then raise exception 'El cobro debe ser mayor a cero'; end if;
  select cp.id into v_existing from public.customer_payments cp join public.accounts_receivable ar on ar.id=cp.receivable_id where ar.id=p_receivable and cp.payment_key=p_payment_key limit 1;
  if v_existing is not null then return v_existing; end if;
  select * into r from public.accounts_receivable where id=p_receivable for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada'; end if;
  if not public.is_company_member(r.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if r.status in ('PAID','CANCELLED') then raise exception 'La cuenta por cobrar no admite más cobros'; end if;
  select * into c from public.cash_accounts where id=p_cash_account and company_id=r.company_id and active=true;
  if not found then raise exception 'Caja o banco no disponible'; end if;
  v_balance:=greatest(r.amount_total-r.amount_paid,0);
  if p_amount>v_balance+0.001 then raise exception 'El cobro excede el saldo pendiente'; end if;
  insert into public.customer_payments(company_id,receivable_id,client_id,cash_account_id,amount,payment_method,reference,notes,payment_key)
  values(r.company_id,r.id,r.client_id,c.id,p_amount,case when p_payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER') then p_payment_method else 'OTHER' end,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_payment_key)
  returning id into v_payment;
  return v_payment;
end; $$;
revoke all on function public.register_customer_payment(uuid,uuid,numeric,text,text,text,uuid) from public,anon;
grant execute on function public.register_customer_payment(uuid,uuid,numeric,text,text,text,uuid) to authenticated;