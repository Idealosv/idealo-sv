create or replace function public.bar_send_order(p_order_id uuid)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_rows int;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'order.send') then raise exception 'Tu rol no puede enviar comandas.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 update public.bar_order_items set status='sent' where order_id=v_order.id and status='new';
 get diagnostics v_rows=row_count;
 if v_rows=0 then raise exception 'No hay productos nuevos para enviar.'; end if;
 -- La cola automática se genera una sola vez por cada línea recién enviada mediante
 -- bar_order_items_enqueue_print_job. bar_queue_station_tickets queda disponible
 -- para reimpresión/cola manual, pero no se invoca aquí para evitar comandas dobles.
 select * into v_order from public.bar_orders where id=p_order_id;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'ORDER_SENT',jsonb_build_object('items_sent',v_rows));
 return v_order;
end;$$;