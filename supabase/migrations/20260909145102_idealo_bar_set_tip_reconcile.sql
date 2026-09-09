create or replace function public.bar_set_order_tip(p_order_id uuid,p_tip numeric)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'tip.manage') then raise exception 'Tu rol no puede modificar la propina.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if; if p_tip is null or p_tip<0 then raise exception 'Propina inválida.'; end if;
 update public.bar_orders set tip_total=round(p_tip,2),tip_updated_by=auth.uid() where id=p_order_id returning * into v_order;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'TIP_UPDATED',jsonb_build_object('tip',v_order.tip_total));
 perform public.bar_reconcile_existing_tip(v_order.id); return v_order;
end;$$;