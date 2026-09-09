create or replace function public.bar_take_payment(p_order_id uuid,p_method text,p_amount numeric default null,p_reference text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype; v_session public.cash_register_sessions%rowtype; v_method text; v_paid numeric; v_due numeric; v_amount numeric; v_account_id uuid; v_account_count integer; v_account_type text; v_payment_id uuid; v_movement_id uuid; v_remaining numeric; v_closed boolean:=false;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para cobrar este pedido.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  v_method:=lower(trim(coalesce(p_method,'')));
  if v_method not in ('cash','card','transfer','other') then raise exception 'Método de pago no válido.'; end if;
  select * into v_session from public.cash_register_sessions where company_id=v_order.company_id and upper(status)='OPEN' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Caja cerrada. Abre un turno de caja antes de cobrar.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=v_order.id;
  v_due:=round(greatest(coalesce(v_order.total,0)-v_paid,0),2);
  if v_due<=0 then raise exception 'El pedido no tiene saldo pendiente.'; end if;
  v_amount:=round(coalesce(p_amount,v_due),2);
  if v_amount<=0 then raise exception 'Monto de pago inválido.'; end if;
  if v_amount>v_due then raise exception 'El pago supera el saldo pendiente de %.',v_due; end if;
  if v_method='cash' then
    v_account_id:=v_session.cash_account_id;
  elsif v_method in ('card','transfer') then
    select count(*) into v_account_count from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true;
    if v_account_count=1 then
      select id into v_account_id from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true order by id::text limit 1;
    else
      v_account_id:=null;
    end if;
  else
    v_account_id:=null;
  end if;
  insert into public.bar_payments(company_id,order_id,cash_register_session_id,method,amount,reference,received_by,financial_posting_status,financial_note)
  values(v_order.company_id,v_order.id,v_session.id,v_method,v_amount,nullif(trim(coalesce(p_reference,'')),''),auth.uid(),case when v_account_id is null then 'pending_account' else 'pending' end,case when v_account_id is null then 'Cobro registrado; falta seleccionar cuenta para contabilizarlo.' else null end)
  returning id into v_payment_id;
  if v_account_id is not null then
    select upper(coalesce(account_type,'')) into v_account_type from public.cash_accounts where id=v_account_id;
    insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
    values(v_order.company_id,v_account_id,now(),'INCOME','BAR_SALE',v_payment_id,'IDEALO BAR · '||v_order.order_code,v_amount,nullif(trim(coalesce(p_reference,'')),''),'Cobro '||upper(v_method)||' registrado desde Operación IDEALO BAR.',case when v_account_type in ('CASH','CAJA') then v_session.id else null end) returning id into v_movement_id;
    update public.bar_payments set cash_movement_id=v_movement_id,financial_posting_status='posted',financial_note='Ingreso contabilizado en Caja/Banco.' where id=v_payment_id;
  end if;
  v_remaining:=round(greatest(v_due-v_amount,0),2);
  if v_remaining<=0 then
    update public.bar_orders set status='paid',closed_at=now(),closed_by=auth.uid(),fulfillment_status=case when order_type='delivery' then fulfillment_status when order_type='takeaway' then 'picked_up' else 'served' end where id=v_order.id;
    if v_order.table_id is not null then update public.bar_tables set status='available' where id=v_order.table_id and company_id=v_order.company_id; end if;
    v_closed:=true;
  end if;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'PAYMENT_RECEIVED',jsonb_build_object('payment_id',v_payment_id,'method',v_method,'amount',v_amount,'remaining',v_remaining,'closed',v_closed));
  return jsonb_build_object('payment_id',v_payment_id,'amount',v_amount,'remaining',v_remaining,'closed',v_closed);
end $$;

create or replace function public.bar_checkout_order(p_order_id uuid,p_method text,p_reference text default null)
returns public.bar_payments
language plpgsql security definer set search_path to 'public'
as $$
declare v_result jsonb; v_payment public.bar_payments%rowtype; v_payment_id uuid;
begin
  v_result:=public.bar_take_payment(p_order_id,p_method,null,p_reference);
  v_payment_id:=(v_result->>'payment_id')::uuid;
  select * into v_payment from public.bar_payments where id=v_payment_id;
  return v_payment;
end $$;

revoke all on function public.bar_take_payment(uuid,text,numeric,text) from public;
revoke all on function public.bar_checkout_order(uuid,text,text) from public;
grant execute on function public.bar_take_payment(uuid,text,numeric,text) to authenticated;
grant execute on function public.bar_checkout_order(uuid,text,text) to authenticated;