-- IDEALO SV · Completa anticipos: cuentas base, vínculo automático COT/OT y vencimiento correcto.

insert into public.cash_accounts(company_id,name,account_type,opening_balance,active)
select c.id,'Caja principal','CASH',0,true from public.companies c
on conflict (company_id,name) do update set active=true;
insert into public.cash_accounts(company_id,name,account_type,opening_balance,active)
select c.id,'Banco principal','BANK',0,true from public.companies c
on conflict (company_id,name) do update set active=true;

create or replace function public.infer_dte_commercial_source()
returns trigger language plpgsql set search_path=public as $$
declare v_ref text; v_quote_number bigint; v_order_number bigint;
begin
  if new.source_quote_id is not null or new.source_work_order_id is not null then return new; end if;
  v_ref:=coalesce(new.dte_payload->'resumen'->'pagos'->0->>'referencia','');
  begin v_quote_number:=(regexp_match(v_ref,'(?:COT|Cotización COT)-([0-9]+)','i'))[1]::bigint; exception when others then v_quote_number:=null; end;
  begin v_order_number:=(regexp_match(v_ref,'OT-([0-9]+)','i'))[1]::bigint; exception when others then v_order_number:=null; end;
  if v_quote_number is not null then
    select q.id into new.source_quote_id from public.quotes q
    where q.company_id=new.company_id and q.number=v_quote_number and (new.client_id is null or q.client_id=new.client_id)
    order by q.created_at desc limit 1;
  end if;
  if v_order_number is not null then
    select w.id into new.source_work_order_id from public.work_orders w
    where w.company_id=new.company_id and w.number=v_order_number and (new.source_quote_id is null or w.quote_id=new.source_quote_id)
    order by w.created_at desc limit 1;
  end if;
  return new;
end; $$;
drop trigger if exists trg_infer_dte_commercial_source on public.dte_documents;
create trigger trg_infer_dte_commercial_source before insert on public.dte_documents for each row execute function public.infer_dte_commercial_source();

create or replace function public.post_processed_dte_financials()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer,1);
  v_total numeric := coalesce((new.dte_payload->'resumen'->>'totalPagar')::numeric,(new.dte_payload->'resumen'->>'montoTotalOperacion')::numeric,0);
  v_payment_code text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'codigo','01');
  v_period integer := coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'periodo')::integer,0),30);
  v_term text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'plazo','01');
  v_account_id uuid; v_account_type text; v_account_name text; v_due date; v_receivable_number bigint; v_receivable_id uuid;
  v_advance record; v_available numeric; v_apply numeric; v_applied numeric := 0; v_remaining numeric;
begin
  if new.environment <> 'production' or new.status <> 'PROCESSED' or old.status='PROCESSED' then return new; end if;
  if v_total<=0 then return new; end if;

  if v_condition=2 then
    v_due:=case v_term when '02' then (current_date+make_interval(months=>v_period))::date when '03' then (current_date+make_interval(years=>v_period))::date else current_date+v_period end;
    select coalesce(max(number),0)+1 into v_receivable_number from public.accounts_receivable where company_id=new.company_id;
    insert into public.accounts_receivable(company_id,client_id,number,concept,amount_total,amount_paid,due_date,status,dte_document_id)
    values(new.company_id,new.client_id,v_receivable_number,'DTE '||new.control_number,v_total,0,v_due,'OPEN',new.id)
    on conflict (dte_document_id) where dte_document_id is not null do update set client_id=excluded.client_id,amount_total=excluded.amount_total,due_date=excluded.due_date,updated_at=now()
    returning id into v_receivable_id;
  end if;

  for v_advance in
    select * from public.customer_advances a
    where a.company_id=new.company_id and a.client_id=new.client_id and a.status in ('OPEN','PARTIAL')
      and ((new.source_work_order_id is not null and a.work_order_id=new.source_work_order_id)
        or (new.source_work_order_id is null and new.source_quote_id is not null and a.quote_id=new.source_quote_id))
    order by a.received_at,a.created_at for update
  loop
    exit when v_applied>=v_total;
    v_available:=greatest(v_advance.amount-v_advance.applied_amount,0);
    v_apply:=least(v_available,v_total-v_applied);
    if v_apply<=0 then continue; end if;
    insert into public.customer_advance_applications(company_id,advance_id,dte_document_id,receivable_id,amount)
    values(new.company_id,v_advance.id,new.id,v_receivable_id,v_apply)
    on conflict (advance_id,dte_document_id) do nothing;
    if found then
      update public.customer_advances set applied_amount=applied_amount+v_apply,status=case when applied_amount+v_apply>=amount then 'APPLIED' else 'PARTIAL' end,updated_at=now() where id=v_advance.id;
      v_applied:=v_applied+v_apply;
      if v_receivable_id is not null then
        insert into public.customer_payments(company_id,receivable_id,client_id,cash_account_id,amount,payment_method,reference,notes,payment_key,source_advance_id,paid_at)
        values(new.company_id,v_receivable_id,new.client_id,v_advance.cash_account_id,v_apply,v_advance.payment_method,coalesce(v_advance.reference,'Anticipo aplicado'),'Anticipo recibido antes del DTE y aplicado a la factura final.',gen_random_uuid(),v_advance.id,v_advance.received_at)
        on conflict (source_advance_id,receivable_id) where source_advance_id is not null do nothing;
      end if;
    end if;
  end loop;

  if v_condition=2 then return new; end if;
  v_remaining:=greatest(v_total-v_applied,0);
  if v_remaining<=0 then return new; end if;
  v_account_type:=case when v_payment_code='01' then 'CASH' else 'BANK' end;
  v_account_name:=case when v_account_type='CASH' then 'Caja principal' else 'Banco principal' end;
  insert into public.cash_accounts(company_id,name,account_type,opening_balance,active) values(new.company_id,v_account_name,v_account_type,0,true)
  on conflict (company_id,name) do update set active=true returning id into v_account_id;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,v_account_id,now(),'INCOME','CUSTOMER_PAYMENT',new.id,'Cobro DTE '||new.control_number,v_remaining,new.dte_payload->'resumen'->'pagos'->0->>'referencia',case when v_applied>0 then format('Saldo cobrado al facturar. Anticipos ya registrados: $%s.',v_applied) else 'Ingreso generado automáticamente después de aceptación de Hacienda.' end)
  on conflict (source_type,source_id) where source_id is not null do nothing;
  return new;
end; $$;
revoke all on function public.post_processed_dte_financials() from public,anon,authenticated;
grant execute on function public.post_processed_dte_financials() to service_role;
