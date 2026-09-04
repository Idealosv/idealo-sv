create or replace function public.sync_dte_to_receivable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_total numeric(12,2); v_condition integer; v_due date; v_period integer;
begin
  if new.environment <> 'production' then return new; end if;
  if new.status <> 'PROCESSED' or new.dte_type not in ('01','03') then return new; end if;
  if tg_op='UPDATE' and old.status='PROCESSED' then return new; end if;
  v_condition:=coalesce((new.dte_payload#>>'{resumen,condicionOperacion}')::integer,1);
  if v_condition<>2 then return new; end if;
  v_total:=coalesce((new.dte_payload#>>'{resumen,totalPagar}')::numeric,(new.dte_payload#>>'{resumen,montoTotalOperacion}')::numeric,0);
  if v_total<=0 then return new; end if;
  begin v_period:=nullif(new.dte_payload#>>'{resumen,pagos,0,periodo}','')::integer; exception when others then v_period:=null; end;
  v_due:=coalesce((new.dte_payload#>>'{identificacion,fecEmi}')::date,current_date)+coalesce(v_period,30);
  insert into public.accounts_receivable(company_id,client_id,dte_document_id,concept,amount_total,due_date,status)
  values(new.company_id,new.client_id,new.id,'DTE-'||new.dte_type||' · '||new.control_number,v_total,v_due,case when v_due<current_date then 'OVERDUE' else 'OPEN' end)
  on conflict (dte_document_id) where dte_document_id is not null do update
    set client_id=excluded.client_id,concept=excluded.concept,amount_total=excluded.amount_total,due_date=excluded.due_date,updated_at=now();
  return new;
end; $function$;

create or replace function public.apply_customer_payment_reversal()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare p public.customer_payments%rowtype; ar public.accounts_receivable%rowtype;
begin
  select * into p from public.customer_payments where id=new.payment_id;
  if not found then raise exception 'Cobro original no encontrado'; end if;
  select * into ar from public.accounts_receivable where id=p.receivable_id;
  if not found then raise exception 'Cuenta por cobrar no encontrada'; end if;

  if p.source_advance_id is not null then
    delete from public.customer_advance_applications
      where company_id=new.company_id and advance_id=p.source_advance_id and receivable_id=new.receivable_id;
    update public.customer_advances
      set applied_amount=greatest(applied_amount-new.amount,0),
          status=case when greatest(applied_amount-new.amount,0)<=0 then 'OPEN' else 'PARTIAL' end,
          updated_at=now()
      where id=p.source_advance_id and company_id=new.company_id;
  else
    insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
    values(new.company_id,new.cash_account_id,new.reversed_at,'EXPENSE','CUSTOMER_PAYMENT_REVERSAL',new.id,'Reversión cobro cliente · CXC-'||ar.number,new.amount,p.reference,'Reversión: '||new.reason)
    on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_PAYMENT_REVERSAL' and source_id is not null do nothing;
  end if;

  perform public.refresh_receivable_balance(new.receivable_id);
  return new;
end; $function$;

create or replace function public.reverse_dte_cash_collection(p_dte uuid,p_reason text,p_reversal_key uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d public.dte_documents%rowtype; m public.cash_movements%rowtype; v_existing uuid; v_id uuid;
begin
  if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'Indicá el motivo de la reversión'; end if;
  select * into d from public.dte_documents where id=p_dte for share;
  if not found then raise exception 'DTE no encontrado'; end if;
  if not public.is_company_member(d.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if d.environment<>'production' or d.status<>'PROCESSED' then raise exception 'Solo se puede revertir el cobro de un DTE de producción aceptado'; end if;
  select * into m from public.cash_movements where company_id=d.company_id and source_type='CUSTOMER_PAYMENT' and source_id=d.id limit 1;
  if not found then raise exception 'Este DTE no tiene cobro directo en Caja/Banco para revertir'; end if;
  select id into v_existing from public.cash_movements where company_id=d.company_id and source_type='CUSTOMER_PAYMENT_REVERSAL' and source_id=d.id limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(d.company_id,m.cash_account_id,now(),'EXPENSE','CUSTOMER_PAYMENT_REVERSAL',d.id,'Reversión cobro DTE '||d.control_number,m.amount,m.reference,'Reversión DTE: '||trim(p_reason))
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.guard_dte_financial_invalidation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_ar uuid;
begin
  if old.status='PROCESSED' and new.status='INVALIDATED' then
    if old.environment='production' then
      select id into v_ar from public.accounts_receivable where dte_document_id=old.id limit 1;
      if v_ar is not null and exists(
        select 1 from public.customer_payments p
        where p.receivable_id=v_ar and not exists(select 1 from public.customer_payment_reversals r where r.payment_id=p.id)
      ) then
        raise exception 'DTE_FINANCIAL_PENDING: primero revertí todos los cobros/anticipos aplicados a la cuenta por cobrar antes de invalidar';
      end if;
      if exists(select 1 from public.cash_movements m where m.company_id=old.company_id and m.source_type='CUSTOMER_PAYMENT' and m.source_id=old.id)
         and not exists(select 1 from public.cash_movements m where m.company_id=old.company_id and m.source_type='CUSTOMER_PAYMENT_REVERSAL' and m.source_id=old.id) then
        raise exception 'DTE_FINANCIAL_PENDING: primero revertí el cobro directo del DTE antes de invalidar';
      end if;
    end if;
    new.financial_state:='INVALIDATED';
    new.financial_posted_at:=now();
    new.financial_note:=case when old.environment='test' then 'DTE TEST invalidado sin afectar saldos reales.' else 'DTE producción invalidado con movimientos financieros previamente conciliados/revertidos.' end;
  end if;
  return new;
end; $function$;

drop trigger if exists trg_guard_dte_financial_invalidation on public.dte_documents;
create trigger trg_guard_dte_financial_invalidation before update of status on public.dte_documents
for each row execute function public.guard_dte_financial_invalidation();

create or replace function public.finalize_dte_financial_invalidation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status='PROCESSED' and new.status='INVALIDATED' and old.environment='production' then
    update public.accounts_receivable
      set status='CANCELLED',updated_at=now()
      where dte_document_id=old.id and coalesce(amount_paid,0)=0;
  end if;
  return new;
end; $function$;

drop trigger if exists trg_finalize_dte_financial_invalidation on public.dte_documents;
create trigger trg_finalize_dte_financial_invalidation after update of status on public.dte_documents
for each row execute function public.finalize_dte_financial_invalidation();

create or replace function public.audit_dte_financial_integrity(p_company uuid)
returns table(severity text,code text,affected bigint,detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_company_member(p_company) then raise exception 'Sin acceso a esta empresa'; end if;

  return query select 'ERROR','TEST_REAL_RECEIVABLE',count(*)::bigint,'DTE TEST aceptados que generaron CxC real; deben ser cero.' from public.accounts_receivable ar join public.dte_documents d on d.id=ar.dte_document_id where d.company_id=p_company and d.environment='test';
  return query select 'ERROR','TEST_REAL_CASH',count(*)::bigint,'DTE TEST con movimientos reales de Caja/Banco; deben ser cero.' from public.cash_movements m join public.dte_documents d on d.id=m.source_id where d.company_id=p_company and d.environment='test' and m.source_type in ('CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL');
  return query select 'ERROR','CREDIT_WITHOUT_RECEIVABLE',count(*)::bigint,'DTE producción aceptados al crédito sin cuenta por cobrar.' from public.dte_documents d where d.company_id=p_company and d.environment='production' and d.status='PROCESSED' and coalesce((d.dte_payload#>>'{resumen,condicionOperacion}')::integer,1)=2 and not exists(select 1 from public.accounts_receivable ar where ar.dte_document_id=d.id);
  return query select 'ERROR','CASH_WITHOUT_COLLECTION',count(*)::bigint,'DTE producción al contado con saldo no cubierto por anticipos y sin cobro real en Caja/Banco.' from public.dte_documents d where d.company_id=p_company and d.environment='production' and d.status='PROCESSED' and coalesce((d.dte_payload#>>'{resumen,condicionOperacion}')::integer,1)<>2 and coalesce((d.dte_payload#>>'{resumen,totalPagar}')::numeric,(d.dte_payload#>>'{resumen,montoTotalOperacion}')::numeric,0)>coalesce((select sum(a.amount) from public.customer_advance_applications a where a.dte_document_id=d.id),0)+0.001 and not exists(select 1 from public.cash_movements m where m.company_id=d.company_id and m.source_type='CUSTOMER_PAYMENT' and m.source_id=d.id);
  return query select 'ERROR','RECEIVABLE_BALANCE_MISMATCH',count(*)::bigint,'CxC cuyo amount_paid no coincide con cobros no revertidos.' from public.accounts_receivable ar where ar.company_id=p_company and abs(coalesce(ar.amount_paid,0)-coalesce((select sum(p.amount) from public.customer_payments p where p.receivable_id=ar.id and not exists(select 1 from public.customer_payment_reversals r where r.payment_id=p.id)),0))>0.01;
  return query select 'ERROR','ADVANCE_OVERAPPLIED',count(*)::bigint,'Anticipos con monto aplicado mayor al recibido.' from public.customer_advances a where a.company_id=p_company and coalesce(a.applied_amount,0)>a.amount+0.001;
  return query select 'ERROR','INVALIDATED_WITH_LIVE_FINANCE',count(*)::bigint,'DTE invalidados que aún conservan cobros o CxC activas.' from public.dte_documents d where d.company_id=p_company and d.status='INVALIDATED' and d.environment='production' and (exists(select 1 from public.accounts_receivable ar where ar.dte_document_id=d.id and ar.status<>'CANCELLED') or (exists(select 1 from public.cash_movements m where m.company_id=d.company_id and m.source_type='CUSTOMER_PAYMENT' and m.source_id=d.id) and not exists(select 1 from public.cash_movements r where r.company_id=d.company_id and r.source_type='CUSTOMER_PAYMENT_REVERSAL' and r.source_id=d.id)));
  return query select 'WARN','REISSUE_WITHOUT_SOURCE',count(*)::bigint,'DTE posteriores a un rechazo que no declaran reissued_from_id; revisar solo cuando realmente sean reemisiones.' from public.dte_documents d where d.company_id=p_company and d.reissued_from_id is null and d.status in ('DRAFT','SIGNED','SENT','PROCESSED') and exists(select 1 from public.dte_documents old where old.company_id=d.company_id and old.status='REJECTED' and old.control_number<>d.control_number and old.created_at<d.created_at and old.client_id is not distinct from d.client_id);
  return query select 'INFO','PRODUCTION_PROCESSED',count(*)::bigint,'DTE de producción aceptados incluidos en Finanzas.' from public.dte_documents d where d.company_id=p_company and d.environment='production' and d.status='PROCESSED';
end; $function$;