-- Auditoría Facturación + Caja: una sola fuente financiera, fecha contable SV y operaciones seguras.

create or replace view public.cash_account_balances
with (security_invoker=true)
as
select
  a.id as cash_account_id,
  a.company_id,
  a.name,
  a.account_type,
  a.opening_balance,
  a.active,
  round(a.opening_balance + coalesce(sum(case
    when m.movement_type in ('INCOME','TRANSFER_IN') then m.amount
    when m.movement_type in ('EXPENSE','TRANSFER_OUT') then -m.amount
    when m.movement_type='ADJUSTMENT' then m.amount
    else 0 end),0),2) as current_balance,
  round(coalesce(sum(case
    when (m.movement_date at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date
      and m.movement_type in ('INCOME','TRANSFER_IN') then m.amount else 0 end),0),2) as income_today,
  round(coalesce(sum(case
    when (m.movement_date at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date
      and m.movement_type in ('EXPENSE','TRANSFER_OUT') then m.amount else 0 end),0),2) as expense_today
from public.cash_accounts a
left join public.cash_movements m on m.cash_account_id=a.id and m.company_id=a.company_id
group by a.id,a.company_id,a.name,a.account_type,a.opening_balance,a.active;

create or replace function public.cash_account_balance_as_of(
  p_company uuid,
  p_cash_account uuid,
  p_date date default ((now() at time zone 'America/El_Salvador')::date)
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare v_opening numeric; v_balance numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_read_finance(p_company) then raise exception 'Sin permiso para consultar Caja y Bancos'; end if;
  select opening_balance into v_opening from public.cash_accounts
  where id=p_cash_account and company_id=p_company and active=true;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  select round((v_opening+coalesce(sum(case
    when movement_type in ('INCOME','TRANSFER_IN') then amount
    when movement_type in ('EXPENSE','TRANSFER_OUT') then -amount
    when movement_type='ADJUSTMENT' then amount
    else 0 end),0))::numeric,2)
  into v_balance
  from public.cash_movements
  where company_id=p_company and cash_account_id=p_cash_account
    and (movement_date at time zone 'America/El_Salvador')::date<=p_date;
  return coalesce(v_balance,v_opening);
end $$;
revoke all on function public.cash_account_balance_as_of(uuid,uuid,date) from public,anon;
grant execute on function public.cash_account_balance_as_of(uuid,uuid,date) to authenticated;

create or replace function public.close_cash_day(
  p_cash_account uuid,
  p_date date default ((now() at time zone 'America/El_Salvador')::date),
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare a public.cash_accounts%rowtype; v_id uuid; v_open numeric(12,2); v_in numeric(12,2); v_out numeric(12,2); v_close numeric(12,2); v_count integer;
begin
  select * into a from public.cash_accounts where id=p_cash_account and active=true;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if not public.erp_can_admin(a.company_id) then raise exception 'Solo propietario o administrador puede realizar cierres diarios'; end if;

  select id into v_id from public.cash_daily_closures
  where company_id=a.company_id and cash_account_id=a.id and closure_date=p_date;
  if v_id is not null then return v_id; end if;

  select round((a.opening_balance+coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount when movement_type in ('EXPENSE','TRANSFER_OUT') then -amount else 0 end),0))::numeric,2)
    into v_open
  from public.cash_movements
  where cash_account_id=a.id and company_id=a.company_id
    and (movement_date at time zone 'America/El_Salvador')::date<p_date;
  v_open:=coalesce(v_open,a.opening_balance);

  select
    coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),
    coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),
    count(*)
  into v_in,v_out,v_count
  from public.cash_movements
  where cash_account_id=a.id and company_id=a.company_id
    and (movement_date at time zone 'America/El_Salvador')::date=p_date;

  v_close:=round((v_open+v_in-v_out)::numeric,2);
  insert into public.cash_daily_closures(company_id,cash_account_id,closure_date,opening_balance,income_total,expense_total,closing_balance,movement_count,notes)
  values(a.company_id,a.id,p_date,v_open,v_in,v_out,v_close,v_count,nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reconcile_cash_account(
  p_cash_account uuid,
  p_statement_balance numeric,
  p_date date default ((now() at time zone 'America/El_Salvador')::date),
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare a public.cash_accounts%rowtype; v_system numeric(12,2); v_id uuid; v_status text; v_existing_status text;
begin
  select * into a from public.cash_accounts where id=p_cash_account and active=true;
  if not found then raise exception 'Cuenta de caja o banco no encontrada'; end if;
  if not public.erp_can_admin(a.company_id) then raise exception 'Solo propietario o administrador puede conciliar'; end if;
  if p_statement_balance is null or p_statement_balance<0 then raise exception 'Saldo contado/bancario inválido'; end if;

  select id,status into v_id,v_existing_status from public.cash_reconciliations
  where company_id=a.company_id and cash_account_id=a.id and reconciliation_date=p_date;
  if v_existing_status='CLOSED' then raise exception 'La conciliación de esta fecha ya está cerrada'; end if;

  select round((a.opening_balance+coalesce(sum(case
    when m.movement_type in ('INCOME','TRANSFER_IN') then m.amount
    when m.movement_type in ('EXPENSE','TRANSFER_OUT') then -m.amount
    when m.movement_type='ADJUSTMENT' then m.amount else 0 end),0))::numeric,2)
  into v_system
  from public.cash_movements m
  where m.cash_account_id=a.id and m.company_id=a.company_id
    and (m.movement_date at time zone 'America/El_Salvador')::date<=p_date;
  v_system:=coalesce(v_system,a.opening_balance);
  v_status:=case when abs(p_statement_balance-v_system)<0.01 then 'MATCHED' else 'DIFFERENCE' end;

  insert into public.cash_reconciliations(company_id,cash_account_id,reconciliation_date,system_balance,statement_balance,status,reference,notes)
  values(a.company_id,a.id,p_date,v_system,round(p_statement_balance,2),v_status,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''))
  on conflict(company_id,cash_account_id,reconciliation_date) do update
    set system_balance=excluded.system_balance,statement_balance=excluded.statement_balance,status=excluded.status,
        reference=excluded.reference,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.guard_closed_cash_day()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_account uuid; v_company uuid; v_date date;
begin
  v_account:=coalesce(new.cash_account_id,old.cash_account_id);
  v_company:=coalesce(new.company_id,old.company_id);
  v_date:=(coalesce(new.movement_date,old.movement_date) at time zone 'America/El_Salvador')::date;
  if exists(select 1 from public.cash_daily_closures c where c.company_id=v_company and c.cash_account_id=v_account and c.closure_date=v_date) then
    raise exception 'El día ya fue cerrado para esta caja o banco';
  end if;
  return coalesce(new,old);
end $$;

create or replace function public.reverse_customer_payment(
  p_payment uuid,
  p_reason text,
  p_reversal_key uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare p public.customer_payments%rowtype; v_existing uuid; v_id uuid; v_balance numeric; v_type text; v_session uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'Indicá el motivo de la reversión'; end if;
  select id into v_existing from public.customer_payment_reversals where payment_id=p_payment or reversal_key=p_reversal_key limit 1;
  if v_existing is not null then return v_existing; end if;
  select * into p from public.customer_payments where id=p_payment for share;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if not public.erp_can_admin(p.company_id) then raise exception 'Solo propietario o administrador puede revertir cobros'; end if;
  if p.source_advance_id is null then
    if p.cash_account_id is null then raise exception 'El cobro no tiene caja o banco asociado'; end if;
    select b.current_balance,upper(coalesce(a.account_type,'')) into v_balance,v_type
    from public.cash_accounts a join public.cash_account_balances b on b.cash_account_id=a.id and b.company_id=a.company_id
    where a.id=p.cash_account_id and a.company_id=p.company_id and a.active=true;
    if not found then raise exception 'Caja o banco no disponible'; end if;
    if coalesce(v_balance,0)<p.amount then raise exception 'Saldo insuficiente para revertir el cobro'; end if;
    if v_type='CASH' then
      select id into v_session from public.cash_register_sessions
      where company_id=p.company_id and cash_account_id=p.cash_account_id and status='OPEN'
      order by opened_at desc limit 1;
      if v_session is null then raise exception 'La caja física debe tener un turno abierto para revertir el cobro'; end if;
    end if;
  end if;
  insert into public.customer_payment_reversals(company_id,payment_id,receivable_id,cash_account_id,amount,reason,reversal_key,reversed_by)
  values(p.company_id,p.id,p.receivable_id,p.cash_account_id,p.amount,trim(p_reason),p_reversal_key,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.register_internal_income(
  p_company_id uuid,
  p_cash_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_received_at timestamptz default now(),
  p_payment_method text default 'CASH',
  p_client_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_quote_id uuid default null,
  p_work_order_id uuid default null
) returns public.internal_income_records
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.internal_income_records; a public.cash_accounts%rowtype; q public.quotes%rowtype; w public.work_orders%rowtype;
  v_method text; v_session uuid; v_session_opened timestamptz; v_total numeric; v_paid numeric; v_received_at timestamptz;
begin
  if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede registrar ingresos internos'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Escribe el concepto del ingreso'; end if;
  select * into a from public.cash_accounts where id=p_cash_account_id and company_id=p_company_id and active=true for update;
  if not found then raise exception 'Caja o banco no disponible'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id) then raise exception 'Cliente no válido para esta empresa'; end if;
  if p_quote_id is not null then
    select * into q from public.quotes where id=p_quote_id and company_id=p_company_id;
    if not found then raise exception 'Cotización no válida'; end if;
    if p_client_id is not null and q.client_id is distinct from p_client_id then raise exception 'La cotización no pertenece al cliente seleccionado'; end if;
  end if;
  if p_work_order_id is not null then
    select * into w from public.work_orders where id=p_work_order_id and company_id=p_company_id;
    if not found then raise exception 'OT no válida'; end if;
    if p_quote_id is not null and w.quote_id is distinct from p_quote_id then raise exception 'La OT no pertenece a la cotización seleccionada'; end if;
    if p_client_id is not null and w.client_id is distinct from p_client_id then raise exception 'La OT no pertenece al cliente seleccionado'; end if;
  end if;

  if (p_quote_id is not null or p_work_order_id is not null) and (
    exists(select 1 from public.dte_documents d
      where d.company_id=p_company_id and d.environment='production' and d.status='PROCESSED'
        and ((p_work_order_id is not null and coalesce(d.source_work_order_id,d.work_order_id)=p_work_order_id)
          or (p_quote_id is not null and coalesce(d.source_quote_id,d.quote_id)=p_quote_id)))
    or exists(select 1 from public.accounts_receivable ar
      where ar.company_id=p_company_id and ar.status<>'CANCELLED'
        and ((p_work_order_id is not null and ar.work_order_id=p_work_order_id)
          or (p_quote_id is not null and ar.quote_id=p_quote_id)))
  ) then
    raise exception 'Este trabajo ya fue facturado. Registra el pago desde Cuentas por cobrar para mantener Caja y Facturación sincronizadas';
  end if;

  v_received_at:=coalesce(p_received_at,now());
  if upper(coalesce(a.account_type,'')) in ('CASH','CAJA','PETTY_CASH') then
    select id,opened_at into v_session,v_session_opened from public.cash_register_sessions
    where company_id=p_company_id and cash_account_id=a.id and status='OPEN' order by opened_at desc limit 1;
    if v_session is null then raise exception 'Caja cerrada. Abre la caja antes de registrar el ingreso'; end if;
    if (v_received_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date then v_received_at:=now();
    elsif v_received_at<v_session_opened then raise exception 'La fecha del ingreso es anterior a la apertura de la caja'; end if;
  end if;

  if p_work_order_id is not null then v_total:=coalesce(w.total,0); elsif p_quote_id is not null then v_total:=coalesce(q.total,0); else v_total:=null; end if;
  if v_total is not null and v_total>0 then
    select coalesce(sum(amount),0) into v_paid from public.internal_income_records
    where company_id=p_company_id and ((p_work_order_id is not null and work_order_id=p_work_order_id) or (p_work_order_id is null and p_quote_id is not null and quote_id=p_quote_id and work_order_id is null));
    if v_paid+round(p_amount,2)>v_total+0.009 then raise exception 'El pago supera el saldo pendiente del trabajo'; end if;
  end if;

  v_method:=case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER') then upper(p_payment_method) else 'OTHER' end;
  insert into public.internal_income_records(company_id,client_id,cash_account_id,received_at,concept,amount,payment_method,reference,notes,fiscal_status,created_by,quote_id,work_order_id)
  values(p_company_id,p_client_id,p_cash_account_id,v_received_at,trim(p_concept),round(p_amount,2),v_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),'NO_DTE_ISSUED',auth.uid(),p_quote_id,p_work_order_id)
  returning * into r;

  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
  values(p_company_id,p_cash_account_id,r.received_at,'INCOME','INTERNAL_INCOME',r.id,'Ingreso interno · '||r.concept,r.amount,r.reference,coalesce(r.notes,'Registrado internamente sin DTE emitido.'),v_session);

  if r.client_id is not null and (r.quote_id is not null or r.work_order_id is not null) then
    insert into public.customer_advances(company_id,client_id,quote_id,work_order_id,cash_account_id,amount,applied_amount,payment_method,reference,notes,received_at,status,source_internal_income_id)
    values(r.company_id,r.client_id,r.quote_id,r.work_order_id,r.cash_account_id,r.amount,0,r.payment_method,
      coalesce(r.reference,'Pago previo CP-'||lpad(coalesce(r.receipt_no,0)::text,6,'0')),
      coalesce(r.notes,'Pago recibido antes del DTE; se aplicará al documento fiscal final.'),r.received_at,'OPEN',r.id)
    on conflict (source_internal_income_id) where source_internal_income_id is not null do nothing;
  end if;
  return r;
end $$;

-- Una sola fuente para crear CxC desde un DTE aceptado: post_processed_dte_financials.
drop trigger if exists trg_sync_dte_to_receivable on public.dte_documents;

create or replace function public.post_processed_dte_financials()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer,1);
  v_total numeric := coalesce((new.dte_payload->'resumen'->>'totalPagar')::numeric,(new.dte_payload->'resumen'->>'montoTotalOperacion')::numeric,0);
  v_payment_code text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'codigo','01');
  v_period integer := coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'periodo')::integer,0),30);
  v_term text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'plazo','01');
  v_issue_date date := coalesce((new.dte_payload->'identificacion'->>'fecEmi')::date,(now() at time zone 'America/El_Salvador')::date);
  v_account_id uuid; v_account_type text; v_due date; v_receivable_number bigint; v_receivable_id uuid;
  v_advance record; v_available numeric; v_apply numeric; v_applied numeric := 0; v_remaining numeric;
  v_account_count integer := 0; v_session_id uuid;
begin
  if new.environment<>'production' or new.status<>'PROCESSED' or old.status='PROCESSED' then return new; end if;
  if v_total<=0 then return new; end if;

  if v_condition=2 then
    v_due:=case v_term when '02' then (v_issue_date+make_interval(months=>v_period))::date when '03' then (v_issue_date+make_interval(years=>v_period))::date else v_issue_date+v_period end;
    select coalesce(max(number),0)+1 into v_receivable_number from public.accounts_receivable where company_id=new.company_id;
    insert into public.accounts_receivable(company_id,client_id,number,concept,amount_total,amount_paid,due_date,status,dte_document_id,quote_id,work_order_id)
    values(new.company_id,new.client_id,v_receivable_number,'DTE '||new.control_number,v_total,0,v_due,'OPEN',new.id,new.source_quote_id,new.source_work_order_id)
    on conflict (dte_document_id) where dte_document_id is not null do update
      set client_id=excluded.client_id,amount_total=excluded.amount_total,due_date=excluded.due_date,
          quote_id=coalesce(public.accounts_receivable.quote_id,excluded.quote_id),work_order_id=coalesce(public.accounts_receivable.work_order_id,excluded.work_order_id),updated_at=now()
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
  select count(*),min(id) into v_account_count,v_account_id from public.cash_accounts
  where company_id=new.company_id and account_type=v_account_type and active=true;
  if v_account_count<>1 or v_account_id is null then
    update public.dte_documents set financial_state='PENDING_CASH_ACCOUNT',financial_note=format('DTE aceptado por MH. El saldo $%s no se contabilizó automáticamente porque se requiere exactamente una cuenta %s activa; revisá Caja/Bancos.',v_remaining,v_account_type),financial_posted_at=now() where id=new.id;
    return new;
  end if;

  if v_account_type='CASH' then
    select id into v_session_id from public.cash_register_sessions
    where company_id=new.company_id and cash_account_id=v_account_id and status='OPEN' order by opened_at desc limit 1;
    if v_session_id is null then
      update public.dte_documents set financial_state='PENDING_CASH_SHIFT',financial_note=format('DTE aceptado por MH. El saldo $%s no se contabilizó en efectivo porque la caja no tiene turno abierto.',v_remaining),financial_posted_at=now() where id=new.id;
      return new;
    end if;
  end if;

  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
  values(new.company_id,v_account_id,now(),'INCOME','DTE_PAYMENT',new.id,'Cobro DTE '||new.control_number,v_remaining,new.dte_payload->'resumen'->'pagos'->0->>'referencia',case when v_applied>0 then format('Saldo cobrado al facturar. Anticipos ya registrados: $%s.',v_applied) else 'Ingreso generado automáticamente después de aceptación de Hacienda.' end,v_session_id)
  on conflict (source_type,source_id) where source_id is not null do nothing;
  return new;
end $$;

update public.cash_movements m
set source_type='DTE_PAYMENT'
where m.source_type='CUSTOMER_PAYMENT'
  and exists(select 1 from public.dte_documents d where d.id=m.source_id and d.company_id=m.company_id)
  and not exists(select 1 from public.customer_payments p where p.id=m.source_id);

create or replace function public.billing_control_snapshot(p_company uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_read(p_company) then raise exception 'Sin permiso para consultar Facturación'; end if;
  select jsonb_build_object(
    'total',count(*),
    'accepted',count(*) filter(where d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null),
    'rejected',count(*) filter(where d.status='REJECTED'),
    'test',count(*) filter(where lower(coalesce(d.environment,'')) in ('test','00')),
    'production',count(*) filter(where lower(coalesce(d.environment,'')) in ('production','01')),
    'withSeal',count(*) filter(where nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null),
    'critical',count(*) filter(where
      (d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is null)
      or (d.status<>'PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null)
      or nullif(trim(coalesce(d.control_number,'')),'') is null
      or d.generation_code is null),
    'amountAccepted',coalesce(sum(case when d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null
      then coalesce((d.dte_payload->'resumen'->>'totalPagar')::numeric,(d.dte_payload->'resumen'->>'montoTotalOperacion')::numeric,0) else 0 end),0)
  ) into result
  from public.dte_documents d where d.company_id=p_company;
  return result;
end $$;
revoke all on function public.billing_control_snapshot(uuid) from public,anon;
grant execute on function public.billing_control_snapshot(uuid) to authenticated;
