-- IDEALO SV · Alinea anticipos ya desplegados con el flujo final Caja -> DTE.

alter table public.dte_documents
  add column if not exists source_quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists source_work_order_id uuid references public.work_orders(id) on delete set null;

alter table public.customer_payments add column if not exists source_advance_id uuid references public.customer_advances(id) on delete restrict;
create unique index if not exists customer_payments_source_advance_dte_uidx on public.customer_payments(source_advance_id,receivable_id) where source_advance_id is not null;

-- Normaliza instalaciones que alcanzaron la primera versión del módulo.
alter table public.customer_advances drop constraint if exists customer_advances_status_check;
update public.customer_advances set status=case status when 'PENDING' then 'OPEN' when 'PARTIALLY_APPLIED' then 'PARTIAL' when 'VOID' then 'CANCELLED' else status end
where status in ('PENDING','PARTIALLY_APPLIED','VOID');
alter table public.customer_advances add constraint customer_advances_status_check check (status in ('OPEN','PARTIAL','APPLIED','CANCELLED'));
alter table public.customer_advances alter column status set default 'OPEN';

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type in ('MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','CUSTOMER_ADVANCE','PURCHASE','EXPENSE','CASH_TRANSFER','CASH_ADJUSTMENT','OTHER'));
create unique index if not exists cash_movements_customer_advance_uidx on public.cash_movements(company_id,source_type,source_id) where source_type='CUSTOMER_ADVANCE' and source_id is not null;

create or replace function public.register_customer_advance(p_company_id uuid,p_client_id uuid,p_quote_id uuid,p_work_order_id uuid,p_cash_account_id uuid,p_amount numeric,p_received_at timestamptz,p_payment_method text,p_reference text,p_notes text)
returns public.customer_advances language plpgsql security invoker set search_path='public' as $$
declare a public.customer_advances; begin
 if not public.is_company_member(p_company_id) then raise exception 'Sin acceso a esta empresa'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'El anticipo debe ser mayor a cero'; end if;
 if not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id) then raise exception 'Cliente no válido'; end if;
 if not exists(select 1 from public.cash_accounts where id=p_cash_account_id and company_id=p_company_id and active=true) then raise exception 'Caja o banco no disponible'; end if;
 if p_quote_id is not null and not exists(select 1 from public.quotes where id=p_quote_id and company_id=p_company_id and client_id=p_client_id) then raise exception 'Cotización no válida para este cliente'; end if;
 if p_work_order_id is not null and not exists(select 1 from public.work_orders where id=p_work_order_id and company_id=p_company_id and (p_quote_id is null or quote_id=p_quote_id)) then raise exception 'Orden de trabajo no válida'; end if;
 insert into public.customer_advances(company_id,client_id,quote_id,work_order_id,cash_account_id,amount,received_at,payment_method,reference,notes,status)
 values(p_company_id,p_client_id,p_quote_id,p_work_order_id,p_cash_account_id,round(p_amount,2),coalesce(p_received_at,now()),case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER') then upper(p_payment_method) else 'OTHER' end,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),'OPEN') returning * into a;
 return a;
end $$;
revoke all on function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text) from public,anon;
grant execute on function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text) to authenticated;

create or replace function public.post_customer_advance_cash() returns trigger language plpgsql security definer set search_path='public' as $$ begin
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
 values(new.company_id,new.cash_account_id,new.received_at,'INCOME','CUSTOMER_ADVANCE',new.id,'Anticipo de cliente',new.amount,new.reference,coalesce(new.notes,'Pendiente de aplicar a factura final.'))
 on conflict (source_type,source_id) where source_id is not null do nothing; return new; end $$;
drop trigger if exists trg_post_customer_advance_cash on public.customer_advances;
create trigger trg_post_customer_advance_cash after insert on public.customer_advances for each row execute function public.post_customer_advance_cash();

create or replace function public.apply_customer_payment_cash() returns trigger language plpgsql security invoker set search_path='public' as $$ declare r public.accounts_receivable%rowtype; begin
 if new.source_advance_id is not null then return new; end if;
 select * into r from public.accounts_receivable where id=new.receivable_id and company_id=new.company_id;
 if not found then raise exception 'Cuenta por cobrar inválida'; end if;
 if new.cash_account_id is null then raise exception 'Seleccioná la caja o banco donde ingresó el cobro'; end if;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
 values(new.company_id,new.cash_account_id,new.paid_at,'INCOME','CUSTOMER_PAYMENT',new.id,'Cobro cliente · CXC-'||r.number,new.amount,new.reference,new.notes)
 on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_PAYMENT' and source_id is not null do nothing; return new; end $$;

drop trigger if exists trg_apply_customer_payment_cash on public.customer_payments;
create trigger trg_apply_customer_payment_cash after insert on public.customer_payments for each row execute function public.apply_customer_payment_cash();

create or replace function public.infer_dte_commercial_source() returns trigger language plpgsql set search_path=public as $$
declare v_ref text; v_quote_number bigint; v_order_number bigint; begin
 if new.source_quote_id is not null or new.source_work_order_id is not null then return new; end if;
 v_ref:=coalesce(new.dte_payload->'resumen'->'pagos'->0->>'referencia','');
 begin v_quote_number:=(regexp_match(v_ref,'(?:COT|Cotización COT)-([0-9]+)','i'))[1]::bigint; exception when others then v_quote_number:=null; end;
 begin v_order_number:=(regexp_match(v_ref,'OT-([0-9]+)','i'))[1]::bigint; exception when others then v_order_number:=null; end;
 if v_quote_number is not null then select q.id into new.source_quote_id from public.quotes q where q.company_id=new.company_id and q.number=v_quote_number and (new.client_id is null or q.client_id=new.client_id) order by q.created_at desc limit 1; end if;
 if v_order_number is not null then select w.id into new.source_work_order_id from public.work_orders w where w.company_id=new.company_id and w.number=v_order_number and (new.source_quote_id is null or w.quote_id=new.source_quote_id) order by w.created_at desc limit 1; end if;
 return new; end $$;
drop trigger if exists trg_infer_dte_commercial_source on public.dte_documents;
create trigger trg_infer_dte_commercial_source before insert on public.dte_documents for each row execute function public.infer_dte_commercial_source();
