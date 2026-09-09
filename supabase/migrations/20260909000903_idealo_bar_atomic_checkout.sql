create or replace function public.bar_checkout_order(
  p_order_id uuid,
  p_method text,
  p_reference text default null
)
returns public.bar_payments
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_order public.bar_orders%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_payment public.bar_payments%rowtype;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_method text;
begin
  select * into v_order
  from public.bar_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
  if not public.erp_can_operate(v_order.company_id) then
    raise exception 'No tienes permiso para cobrar este pedido.';
  end if;
  if v_order.status in ('paid','cancelled') then
    raise exception 'El pedido ya está cerrado.';
  end if;

  v_method := lower(trim(coalesce(p_method,'')));
  if v_method not in ('cash','card','transfer','other') then
    raise exception 'Método de pago no válido.';
  end if;

  select * into v_session
  from public.cash_register_sessions
  where company_id = v_order.company_id
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Caja cerrada. Abre una caja en IDEALO SV antes de cobrar.';
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.bar_payments
  where order_id = v_order.id;

  v_due := round(greatest(coalesce(v_order.total,0) - v_paid,0),2);
  if v_due <= 0 then
    raise exception 'El pedido no tiene saldo pendiente.';
  end if;

  insert into public.bar_payments(
    company_id, order_id, cash_register_session_id, method, amount, reference, received_by
  ) values (
    v_order.company_id, v_order.id, v_session.id, v_method, v_due,
    nullif(trim(coalesce(p_reference,'')),''), auth.uid()
  ) returning * into v_payment;

  update public.bar_orders
  set status = 'paid', closed_at = now(), closed_by = auth.uid()
  where id = v_order.id;

  if v_order.table_id is not null then
    update public.bar_tables
    set status = 'available'
    where id = v_order.table_id
      and company_id = v_order.company_id;
  end if;

  return v_payment;
end;
$$;

revoke all on function public.bar_checkout_order(uuid,text,text) from public, anon;
grant execute on function public.bar_checkout_order(uuid,text,text) to authenticated;
