-- IDEALO BAR · seguridad cuando existen varias cajas simultáneas
-- Mantiene compatible una caja compartida única, pero evita imputar/cerrar otra caja por accidente cuando hay varias abiertas.

create or replace function public.bar_take_payment(p_order_id uuid,p_method text,p_amount numeric default null,p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.bar_orders%rowtype;v_session public.cash_register_sessions%rowtype;v_method text;v_paid numeric;v_due numeric;v_tendered numeric;v_amount numeric;v_change numeric:=0;v_account_id uuid;v_account_count integer;v_account_type text;v_payment_id uuid;v_movement_id uuid;v_remaining numeric;v_closed boolean:=false;v_open_sessions integer:=0;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select * into v_order from public.bar_orders where id=p_order_id for update;if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.bar_has_permission(v_order.company_id,'payment.take') then raise exception 'Tu rol no puede cobrar este pedido.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  v_method:=lower(trim(coalesce(p_method,'')));if v_method not in ('cash','card','transfer','other') then raise exception 'Método de pago no válido.'; end if;

  select count(*) into v_open_sessions from public.cash_register_sessions where company_id=v_order.company_id and upper(status)='OPEN';
  if v_open_sessions=0 then raise exception 'Caja cerrada. Abre un turno de caja antes de cobrar.'; end if;
  select * into v_session from public.cash_register_sessions where company_id=v_order.company_id and upper(status)='OPEN' order by case when opened_by=auth.uid() then 0 else 1 end,opened_at desc limit 1 for update;
  if v_open_sessions>1 and v_session.opened_by is distinct from auth.uid() and not public.erp_can_admin(v_order.company_id) then raise exception 'Hay varias cajas abiertas. Abre o usa tu propia caja antes de cobrar para evitar imputar el pago a otro turno.'; end if;

  select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=v_order.id;
  v_due:=round(greatest(coalesce(v_order.total,0)-v_paid,0),2);if v_due<=0 then raise exception 'El pedido no tiene saldo pendiente.'; end if;
  v_tendered:=round(coalesce(p_amount,v_due),2);if v_tendered<=0 then raise exception 'Monto de pago inválido.'; end if;
  if v_method='cash' then v_amount:=least(v_tendered,v_due);v_change:=round(greatest(v_tendered-v_due,0),2);else if v_tendered>v_due then raise exception 'El pago supera el saldo pendiente de %.',v_due;end if;v_amount:=v_tendered;end if;
  if v_method='cash' then v_account_id:=v_session.cash_account_id;
  elsif v_method in ('card','transfer') then
    select count(*) into v_account_count from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true;
    if v_account_count=1 then select id into v_account_id from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true order by id::text limit 1;else v_account_id:=null;end if;
  else v_account_id:=null;end if;

  insert into public.bar_payments(company_id,order_id,cash_register_session_id,method,amount,reference,received_by,financial_posting_status,financial_note)
  values(v_order.company_id,v_order.id,v_session.id,v_method,v_amount,nullif(trim(coalesce(p_reference,'')),''),auth.uid(),case when v_account_id is null then 'pending_account' else 'pending' end,case when v_account_id is null then 'Cobro registrado; falta seleccionar cuenta para contabilizarlo.' when v_change>0 then 'Efectivo recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.' else null end)
  returning id into v_payment_id;

  if v_account_id is not null then
    select upper(coalesce(account_type,'')) into v_account_type from public.cash_accounts where id=v_account_id;
    insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
    values(v_order.company_id,v_account_id,now(),'INCOME','BAR_SALE',v_payment_id,'IDEALO BAR · '||v_order.order_code,v_amount,nullif(trim(coalesce(p_reference,'')),''),case when v_change>0 then 'Cobro EFECTIVO. Recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.' else 'Cobro '||upper(v_method)||' registrado desde Operación IDEALO BAR.' end,case when v_account_type in ('CASH','CAJA') then v_session.id else null end) returning id into v_movement_id;
    update public.bar_payments set cash_movement_id=v_movement_id,financial_posting_status='posted',financial_note=case when v_change>0 then 'Ingreso contabilizado. Recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.' else 'Ingreso contabilizado en Caja/Banco.' end where id=v_payment_id;
  end if;

  v_remaining:=round(greatest(v_due-v_amount,0),2);
  if v_remaining<=0 then
    update public.bar_orders set status='paid',closed_at=now(),closed_by=auth.uid(),fulfillment_status=case when order_type='delivery' then fulfillment_status when order_type='takeaway' then 'picked_up' else 'served' end where id=v_order.id;
    if v_order.table_id is not null then update public.bar_tables set status='available' where id=v_order.table_id and company_id=v_order.company_id;end if;v_closed:=true;
  end if;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'PAYMENT_RECEIVED',jsonb_build_object('payment_id',v_payment_id,'method',v_method,'amount',v_amount,'tendered',v_tendered,'change',v_change,'remaining',v_remaining,'closed',v_closed,'cash_session_id',v_session.id));
  return jsonb_build_object('payment_id',v_payment_id,'amount',v_amount,'tendered',v_tendered,'change',v_change,'remaining',v_remaining,'closed',v_closed,'cash_session_id',v_session.id);
end;$$;

create or replace function public.bar_close_cash_register(p_session uuid,p_counted numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.cash_register_sessions%rowtype;v_open_orders integer;v_open_sessions integer;
begin
 select * into s from public.cash_register_sessions where id=p_session for update;if not found then raise exception 'Turno de caja no encontrado';end if;
 if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.close')) then raise exception 'Tu rol no puede cerrar caja';end if;
 if s.status<>'OPEN' then raise exception 'La caja ya está cerrada';end if;
 select count(*) into v_open_sessions from public.cash_register_sessions where company_id=s.company_id and upper(status)='OPEN';
 if v_open_sessions>1 and s.opened_by is distinct from auth.uid() and not public.erp_can_admin(s.company_id) then raise exception 'Hay varias cajas abiertas. Solo podés cerrar tu propio turno de caja.';end if;
 select count(*) into v_open_orders from public.bar_orders where company_id=s.company_id and status in ('open','sent','preparing','ready','served');
 if v_open_orders>0 then raise exception 'No podés cerrar caja: hay % pedido(s) activo(s)',v_open_orders;end if;
 return public.close_cash_register(p_session,p_counted,p_notes);
end;$$;

create or replace function public.bar_register_cash_movement(p_session uuid,p_movement_type text,p_amount numeric,p_concept text,p_reference text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare s public.cash_register_sessions%rowtype;v_type text:=upper(trim(coalesce(p_movement_type,'')));v_id uuid;v_open_sessions integer;
begin
 select * into s from public.cash_register_sessions where id=p_session for update;if not found then raise exception 'Turno de caja no encontrado';end if;
 if s.status<>'OPEN' then raise exception 'La caja está cerrada';end if;
 if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.cut')) then raise exception 'Tu rol no puede registrar movimientos de caja';end if;
 select count(*) into v_open_sessions from public.cash_register_sessions where company_id=s.company_id and upper(status)='OPEN';
 if v_open_sessions>1 and s.opened_by is distinct from auth.uid() and not public.erp_can_admin(s.company_id) then raise exception 'Hay varias cajas abiertas. Registra el movimiento en tu propio turno.';end if;
 if v_type not in ('INCOME','EXPENSE') then raise exception 'Tipo de movimiento inválido';end if;if coalesce(p_amount,0)<=0 then raise exception 'El monto debe ser mayor a cero';end if;if char_length(trim(coalesce(p_concept,'')))<4 then raise exception 'Indicá el concepto del movimiento';end if;
 insert into public.cash_movements(company_id,cash_account_id,movement_type,source_type,concept,amount,reference,notes,cash_register_session_id) values(s.company_id,s.cash_account_id,v_type,'MANUAL',trim(p_concept),round(p_amount,2),nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),s.id) returning id into v_id;return v_id;
end;$$;

create index if not exists cash_register_sessions_company_opened_by_idx on public.cash_register_sessions(company_id,opened_by,opened_at desc) where status='OPEN';
