create or replace function public.bar_apply_order_discount(p_order_id uuid,p_mode text,p_value numeric,p_reason text)
returns public.bar_orders
language plpgsql
security invoker
set search_path=public
as $$
declare v_order public.bar_orders%rowtype; v_discount numeric; v_mode text; v_enabled boolean:=true; v_max_percent numeric:=20; v_equivalent numeric;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_admin(v_order.company_id) then raise exception 'Solo propietario o administrador puede autorizar descuentos manuales.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'El descuento requiere motivo.'; end if;
  select manual_discounts_enabled,max_manual_discount_percent into v_enabled,v_max_percent from public.bar_settings where company_id=v_order.company_id;
  if found and not v_enabled then raise exception 'Los descuentos manuales están desactivados en Configuración del bar.'; end if;
  v_mode:=upper(trim(coalesce(p_mode,'')));
  if p_value is null or p_value<0 then raise exception 'Valor de descuento inválido.'; end if;
  if v_mode='PERCENT' then
    if p_value>coalesce(v_max_percent,20) then raise exception 'El descuento supera el máximo permitido de % por ciento.',coalesce(v_max_percent,20); end if;
    v_discount:=round(v_order.subtotal*p_value/100,2);
  elsif v_mode='AMOUNT' then
    v_discount:=round(p_value,2);
    v_equivalent:=case when v_order.subtotal>0 then (v_discount/v_order.subtotal*100) else 0 end;
    if v_equivalent>coalesce(v_max_percent,20) then raise exception 'El descuento equivale a % por ciento y supera el máximo permitido de % por ciento.',round(v_equivalent,2),coalesce(v_max_percent,20); end if;
  else raise exception 'Tipo de descuento inválido.'; end if;
  v_discount:=least(v_discount,v_order.subtotal);
  update public.bar_orders set discount_total=v_discount,manual_discount_reason=trim(p_reason),discount_authorized_by=auth.uid() where id=p_order_id returning * into v_order;
  insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'DISCOUNT_APPLIED',trim(p_reason),jsonb_build_object('mode',v_mode,'value',p_value,'discount_total',v_discount,'max_percent',v_max_percent));
  return v_order;
end;
$$;

create or replace function public.bar_void_order_item(p_item_id uuid,p_reason text)
returns public.bar_order_items
language plpgsql
security invoker
set search_path=public
as $$
declare v_item public.bar_order_items%rowtype; v_order public.bar_orders%rowtype; v_cons record; v_return_id uuid; v_require_reason boolean:=true; v_require_manager boolean:=true; v_reason text;
begin
  select * into v_item from public.bar_order_items where id=p_item_id for update;
  if not found then raise exception 'Producto del pedido no encontrado.'; end if;
  select * into v_order from public.bar_orders where id=v_item.order_id for update;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para anular este producto.'; end if;
  if v_item.status='cancelled' then return v_item; end if;
  select require_void_reason,require_manager_after_send into v_require_reason,v_require_manager from public.bar_settings where company_id=v_order.company_id;
  v_reason=nullif(trim(coalesce(p_reason,'')),'');
  if coalesce(v_require_reason,true) and v_reason is null then raise exception 'La anulación requiere motivo.'; end if;
  v_reason=coalesce(v_reason,'Sin motivo registrado');
  if v_item.status<>'new' and coalesce(v_require_manager,true) and not public.erp_can_admin(v_order.company_id) then raise exception 'Un producto ya enviado requiere autorización de propietario o administrador.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  for v_cons in select * from public.bar_inventory_consumptions where order_item_id=v_item.id and reversed_at is null for update loop
    insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,document_type,document_id,reference,notes)
    values(v_cons.company_id,v_cons.inventory_item_id,'RETURN',v_cons.quantity,v_cons.unit_cost,'BAR_VOID',v_item.id,v_order.order_code,'Reversión por anulación operativa en IDEALO BAR: '||v_reason) returning id into v_return_id;
    update public.bar_inventory_consumptions set reversed_at=now(),reversal_movement_id=v_return_id where id=v_cons.id;
  end loop;
  update public.bar_order_items set status='cancelled',void_reason=v_reason,voided_at=now(),voided_by=auth.uid() where id=v_item.id returning * into v_item;
  insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'ITEM_VOIDED',v_reason,jsonb_build_object('order_item_id',v_item.id,'item_name',v_item.item_name,'quantity',v_item.quantity,'manager_required',coalesce(v_require_manager,true)));
  return v_item;
end;
$$;