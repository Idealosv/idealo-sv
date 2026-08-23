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