-- IDEALO BAR · baseline de permisos operativos por rol
-- Este archivo versiona la migración ya aplicada en Supabase para instalaciones nuevas.

create or replace function public.bar_permissions_for_role(p_role text)
returns text[] language sql immutable set search_path=public as $$
select case lower(trim(coalesce(p_role,'')))
 when 'owner' then array['*']::text[]
 when 'manager' then array['*']::text[]
 when 'cashier' then array['operation.access','summary.view','sales.view','orders.view','payment.take','tip.manage','cash.view','cash.open','cash.cut','cash.close','reservation.view','delivery.view']::text[]
 when 'waiter' then array['operation.access','summary.view','sales.view','orders.view','order.create','order.edit','item.add','item.edit','item.void','order.send','order.cancel','bill.request','table.transfer','reservation.view','reservation.manage','delivery.view','delivery.manage']::text[]
 when 'kitchen' then array['operation.access','kitchen.view','kitchen.advance']::text[]
 when 'bar' then array['operation.access','bar.view','bar.advance']::text[]
 when 'warehouse' then array['inventory.view','inventory.manage']::text[]
 else array[]::text[] end;
$$;

create or replace function public.bar_has_permission(p_company_id uuid,p_permission text)
returns boolean language sql stable set search_path=public as $$
select coalesce((select s.active and ('*'=any(public.bar_permissions_for_role(s.bar_role)) or lower(trim(coalesce(p_permission,'')))=any(public.bar_permissions_for_role(s.bar_role))) from public.bar_staff_assignments s where s.company_id=p_company_id and s.user_id=auth.uid() limit 1),false);
$$;

create or replace function public.bar_my_access(p_company_id uuid)
returns jsonb language sql stable set search_path=public as $$
select coalesce((select jsonb_build_object('role',s.bar_role,'active',s.active,'display_name',s.display_name,'permissions',to_jsonb(public.bar_permissions_for_role(s.bar_role))) from public.bar_staff_assignments s where s.company_id=p_company_id and s.user_id=auth.uid() limit 1),jsonb_build_object('role','none','active',false,'display_name','','permissions','[]'::jsonb));
$$;

create or replace function public.bar_create_order(p_company_id uuid,p_order_type text,p_table_id uuid default null)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_type text; v_table public.bar_tables%rowtype; v_order public.bar_orders%rowtype; v_guests int:=1;
begin
 if not public.bar_has_permission(p_company_id,'order.create') then raise exception 'Tu rol no puede abrir pedidos.'; end if;
 v_type:=lower(trim(coalesce(p_order_type,''))); if v_type not in ('table','takeaway','delivery') then raise exception 'Tipo de pedido inválido.'; end if;
 select default_guest_count into v_guests from public.bar_settings where company_id=p_company_id; v_guests:=coalesce(v_guests,1);
 if v_type='table' then
   if p_table_id is null then raise exception 'Selecciona una mesa.'; end if;
   select * into v_table from public.bar_tables where id=p_table_id and company_id=p_company_id and active=true for update; if not found then raise exception 'Mesa no encontrada.'; end if;
   if v_table.status<>'available' or exists(select 1 from public.bar_orders where table_id=p_table_id and status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa no está disponible.'; end if;
 elsif p_table_id is not null then raise exception 'Solo los pedidos de mesa pueden recibir mesa.'; end if;
 insert into public.bar_orders(company_id,table_id,order_type,status,waiter_id,guest_count,fulfillment_status) values(p_company_id,p_table_id,v_type,'open',auth.uid(),v_guests,'pending') returning * into v_order;
 if p_table_id is not null then update public.bar_tables set status='occupied' where id=p_table_id; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(p_company_id,v_order.id,'ORDER_OPENED',jsonb_build_object('order_type',v_type,'table_id',p_table_id,'bar_role',(public.bar_my_access(p_company_id)->>'role')));
 return v_order;
end;$$;

create or replace function public.bar_send_order(p_order_id uuid)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_rows int;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'order.send') then raise exception 'Tu rol no puede enviar comandas.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 update public.bar_order_items set status='sent' where order_id=v_order.id and status='new'; get diagnostics v_rows=row_count; if v_rows=0 then raise exception 'No hay productos nuevos para enviar.'; end if;
 select * into v_order from public.bar_orders where id=p_order_id; insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'ORDER_SENT',jsonb_build_object('items_sent',v_rows)); return v_order;
end;$$;

create or replace function public.bar_advance_station_item(p_item_id uuid)
returns public.bar_order_items language plpgsql set search_path=public as $$
declare v_item public.bar_order_items%rowtype; v_next text;
begin
 select * into v_item from public.bar_order_items where id=p_item_id for update; if not found then raise exception 'Producto no encontrado.'; end if;
 if v_item.station='kitchen' then if not public.bar_has_permission(v_item.company_id,'kitchen.advance') then raise exception 'Tu rol no puede operar Cocina.'; end if;
 elsif v_item.station='bar' then if not public.bar_has_permission(v_item.company_id,'bar.advance') then raise exception 'Tu rol no puede operar Barra.'; end if;
 else raise exception 'Estación no válida.'; end if;
 v_next:=case v_item.status when 'sent' then 'preparing' when 'preparing' then 'ready' when 'ready' then 'served' else null end; if v_next is null then raise exception 'El producto ya no tiene una transición pendiente.'; end if;
 update public.bar_order_items set status=v_next where id=v_item.id returning * into v_item; return v_item;
end;$$;

create or replace function public.bar_request_bill(p_order_id uuid)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'bill.request') then raise exception 'Tu rol no puede solicitar la cuenta.'; end if;
 if v_order.table_id is null then raise exception 'Este pedido no está en una mesa.'; end if; if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 update public.bar_tables set status='awaiting_payment' where id=v_order.table_id and company_id=v_order.company_id; update public.bar_orders set requested_bill_at=now() where id=v_order.id returning * into v_order;
 insert into public.bar_order_events(company_id,order_id,event_type) values(v_order.company_id,v_order.id,'BILL_REQUESTED'); return v_order;
end;$$;

create or replace function public.bar_guard_payment_insert() returns trigger language plpgsql set search_path=public as $$
begin if auth.uid() is not null and not public.bar_has_permission(new.company_id,'payment.take') then raise exception 'Tu rol no tiene permiso para cobrar pedidos del bar.'; end if; return new; end;$$;

drop trigger if exists bar_payments_role_guard on public.bar_payments;
create trigger bar_payments_role_guard before insert on public.bar_payments for each row execute function public.bar_guard_payment_insert();

create or replace function public.bar_guard_order_role_update() returns trigger language plpgsql set search_path=public as $$
declare v_changed text[]; v_action text;
begin
 if auth.uid() is null or pg_trigger_depth()>1 or public.bar_has_permission(new.company_id,'admin.manage') then return new; end if;
 select coalesce(array_agg(j.key order by j.key),array[]::text[]) into v_changed from jsonb_each(to_jsonb(new)) j where j.value is distinct from (to_jsonb(old)->j.key); v_action:=coalesce(current_setting('idealo.bar_action',true),'');
 if v_action='cancel_order' and public.bar_has_permission(new.company_id,'order.cancel') then return new; end if;
 if public.bar_has_permission(new.company_id,'payment.take') and v_changed <@ array['status','closed_at','closed_by','fulfillment_status','updated_at']::text[] then return new; end if;
 if public.bar_has_permission(new.company_id,'tip.manage') and v_changed <@ array['tip_total','tip_updated_by','updated_at']::text[] then return new; end if;
 if public.bar_has_permission(new.company_id,'bill.request') and v_changed <@ array['requested_bill_at','updated_at']::text[] then return new; end if;
 if public.bar_has_permission(new.company_id,'delivery.manage') and v_changed <@ array['fulfillment_status','driver_name','driver_phone','customer_name','customer_phone','delivery_address','notes','updated_at']::text[] then return new; end if;
 if public.bar_has_permission(new.company_id,'order.edit') and v_changed <@ array['table_id','waiter_id','guest_count','customer_name','customer_phone','delivery_address','driver_name','driver_phone','notes','requested_bill_at','fulfillment_status','updated_at']::text[] then return new; end if;
 raise exception 'Tu rol no puede realizar este cambio en el pedido.';
end;$$;

drop trigger if exists zz_bar_orders_role_guard on public.bar_orders;
create trigger zz_bar_orders_role_guard after update on public.bar_orders for each row execute function public.bar_guard_order_role_update();

create or replace function public.bar_guard_order_item_role_update() returns trigger language plpgsql set search_path=public as $$
declare v_changed text[]; v_action text;
begin
 if auth.uid() is null or public.bar_has_permission(new.company_id,'admin.manage') then return new; end if;
 select coalesce(array_agg(j.key order by j.key),array[]::text[]) into v_changed from jsonb_each(to_jsonb(new)) j where j.value is distinct from (to_jsonb(old)->j.key); v_action:=coalesce(current_setting('idealo.bar_action',true),'');
 if v_action in ('void_item','cancel_order') and public.bar_has_permission(new.company_id,'item.void') then return new; end if;
 if old.station='kitchen' and public.bar_has_permission(new.company_id,'kitchen.advance') then if v_changed <@ array['status','updated_at']::text[] and ((old.status='sent' and new.status='preparing') or (old.status='preparing' and new.status='ready') or (old.status='ready' and new.status='served')) then return new; end if; raise exception 'Cocina solo puede avanzar el estado de sus productos.'; end if;
 if old.station='bar' and public.bar_has_permission(new.company_id,'bar.advance') then if v_changed <@ array['status','updated_at']::text[] and ((old.status='sent' and new.status='preparing') or (old.status='preparing' and new.status='ready') or (old.status='ready' and new.status='served')) then return new; end if; raise exception 'Barra solo puede avanzar el estado de sus productos.'; end if;
 if public.bar_has_permission(new.company_id,'order.send') and old.status='new' and new.status='sent' and v_changed <@ array['status','updated_at']::text[] then return new; end if;
 if public.bar_has_permission(new.company_id,'item.edit') and old.status='new' and new.status='new' and v_changed <@ array['quantity','notes','seat_number','unit_price','base_unit_price','promotion_id','promotion_name','promotion_discount','line_total','updated_at']::text[] then if new.quantity is not distinct from old.quantity and (new.unit_price is distinct from old.unit_price or new.base_unit_price is distinct from old.base_unit_price or new.promotion_id is distinct from old.promotion_id or new.promotion_name is distinct from old.promotion_name or new.promotion_discount is distinct from old.promotion_discount) then raise exception 'El precio de la comanda no se puede modificar manualmente.'; end if; return new; end if;
 raise exception 'Tu rol no puede realizar este cambio en la comanda.';
end;$$;

drop trigger if exists zz_bar_order_items_role_guard on public.bar_order_items;
create trigger zz_bar_order_items_role_guard after update on public.bar_order_items for each row execute function public.bar_guard_order_item_role_update();

grant execute on function public.bar_my_access(uuid) to authenticated;
grant execute on function public.bar_create_order(uuid,text,uuid) to authenticated;
grant execute on function public.bar_send_order(uuid) to authenticated;
grant execute on function public.bar_advance_station_item(uuid) to authenticated;
grant execute on function public.bar_request_bill(uuid) to authenticated;
