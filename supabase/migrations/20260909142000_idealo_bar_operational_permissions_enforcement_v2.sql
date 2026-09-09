-- IDEALO BAR · permisos operativos granulares v2
-- La autenticación y pertenencia a empresa siguen siendo centrales; esta capa limita acciones dentro del bar.

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

create or replace function public.bar_guard_order_insert()
returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and not public.bar_has_permission(new.company_id,'order.create') and not public.bar_has_permission(new.company_id,'admin.manage') then raise exception 'Tu rol no puede abrir pedidos.'; end if;
 return new;
end;$$;

create or replace function public.bar_guard_item_insert()
returns trigger language plpgsql set search_path=public as $$
declare v_status text;
begin
 if auth.uid() is not null and not public.bar_has_permission(new.company_id,'item.add') and not public.bar_has_permission(new.company_id,'admin.manage') then raise exception 'Tu rol no puede agregar productos a comandas.'; end if;
 select status into v_status from public.bar_orders where id=new.order_id and company_id=new.company_id;
 if v_status is null then raise exception 'Pedido no encontrado.'; end if;
 if v_status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 return new;
end;$$;

create or replace function public.bar_guard_item_delete()
returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid() is not null and not public.bar_has_permission(old.company_id,'admin.manage') then
   if not public.bar_has_permission(old.company_id,'item.edit') or old.status<>'new' then raise exception 'Tu rol no puede eliminar este producto.'; end if;
 end if;
 return old;
end;$$;

create or replace function public.bar_guard_reservation_write()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
 v_company:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 if auth.uid() is not null and not public.bar_has_permission(v_company,'reservation.manage') and not public.bar_has_permission(v_company,'admin.manage') then raise exception 'Tu rol no puede modificar reservas.'; end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;

create or replace function public.bar_guard_table_structure_write()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
 v_company:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 if auth.uid() is not null and not public.bar_has_permission(v_company,'admin.manage') then raise exception 'Solo Propietario o Gerente puede crear o eliminar mesas.'; end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;

drop trigger if exists bar_orders_role_insert_guard on public.bar_orders;
create trigger bar_orders_role_insert_guard before insert on public.bar_orders for each row execute function public.bar_guard_order_insert();
drop trigger if exists bar_order_items_role_insert_guard on public.bar_order_items;
create trigger bar_order_items_role_insert_guard before insert on public.bar_order_items for each row execute function public.bar_guard_item_insert();
drop trigger if exists bar_order_items_role_delete_guard on public.bar_order_items;
create trigger bar_order_items_role_delete_guard before delete on public.bar_order_items for each row execute function public.bar_guard_item_delete();
drop trigger if exists bar_reservations_role_write_guard on public.bar_reservations;
create trigger bar_reservations_role_write_guard before insert or update or delete on public.bar_reservations for each row execute function public.bar_guard_reservation_write();
drop trigger if exists bar_tables_role_insert_guard on public.bar_tables;
create trigger bar_tables_role_insert_guard before insert on public.bar_tables for each row execute function public.bar_guard_table_structure_write();
drop trigger if exists bar_tables_role_delete_guard on public.bar_tables;
create trigger bar_tables_role_delete_guard before delete on public.bar_tables for each row execute function public.bar_guard_table_structure_write();

create or replace function public.bar_update_order_details(p_order_id uuid,p_waiter_id uuid default null,p_guest_count integer default null,p_customer_name text default null,p_customer_phone text default null,p_delivery_address text default null,p_driver_name text default null,p_driver_phone text default null,p_notes text default null)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'order.edit') then raise exception 'Tu rol no puede modificar este pedido.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 if p_waiter_id is not null and not exists(select 1 from public.bar_staff_assignments s where s.company_id=v_order.company_id and s.user_id=p_waiter_id and s.active=true and s.bar_role in ('owner','manager','waiter')) then raise exception 'El mesero no está habilitado para atender pedidos.'; end if;
 if p_guest_count is not null and (p_guest_count<1 or p_guest_count>100) then raise exception 'Cantidad de personas inválida.'; end if;
 update public.bar_orders set waiter_id=coalesce(p_waiter_id,waiter_id),guest_count=coalesce(p_guest_count,guest_count),customer_name=case when p_customer_name is null then customer_name else nullif(trim(p_customer_name),'') end,customer_phone=case when p_customer_phone is null then customer_phone else nullif(trim(p_customer_phone),'') end,delivery_address=case when p_delivery_address is null then delivery_address else nullif(trim(p_delivery_address),'') end,driver_name=case when p_driver_name is null then driver_name else nullif(trim(p_driver_name),'') end,driver_phone=case when p_driver_phone is null then driver_phone else nullif(trim(p_driver_phone),'') end,notes=case when p_notes is null then notes else nullif(trim(p_notes),'') end where id=p_order_id returning * into v_order;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'ORDER_DETAILS_UPDATED',jsonb_build_object('guest_count',v_order.guest_count,'waiter_id',v_order.waiter_id));
 return v_order;
end;$$;

create or replace function public.bar_transfer_order_table(p_order_id uuid,p_target_table_id uuid,p_reason text default null)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_target public.bar_tables%rowtype; v_source uuid;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'table.transfer') then raise exception 'Tu rol no puede mover mesas.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if; if v_order.order_type<>'table' then raise exception 'Solo los pedidos de mesa se pueden trasladar.'; end if;
 select * into v_target from public.bar_tables where id=p_target_table_id and company_id=v_order.company_id and active=true for update; if not found then raise exception 'Mesa destino no encontrada.'; end if;
 if v_target.status<>'available' then raise exception 'La mesa destino no está disponible.'; end if;
 if exists(select 1 from public.bar_orders o where o.table_id=v_target.id and o.status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa destino ya tiene un pedido activo.'; end if;
 v_source:=v_order.table_id; if v_source=p_target_table_id then return v_order; end if;
 update public.bar_orders set table_id=p_target_table_id where id=v_order.id returning * into v_order; update public.bar_tables set status='occupied' where id=p_target_table_id; if v_source is not null then update public.bar_tables set status='available' where id=v_source and company_id=v_order.company_id; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'TABLE_TRANSFER',nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('from_table_id',v_source,'to_table_id',p_target_table_id)); return v_order;
end;$$;

create or replace function public.bar_set_order_tip(p_order_id uuid,p_tip numeric)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'tip.manage') then raise exception 'Tu rol no puede modificar la propina.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if; if p_tip is null or p_tip<0 then raise exception 'Propina inválida.'; end if;
 update public.bar_orders set tip_total=round(p_tip,2),tip_updated_by=auth.uid() where id=p_order_id returning * into v_order;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'TIP_UPDATED',jsonb_build_object('tip',v_order.tip_total)); return v_order;
end;$$;

create or replace function public.bar_update_fulfillment_status(p_order_id uuid,p_status text)
returns public.bar_orders language plpgsql set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_status text;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'delivery.manage') then raise exception 'Tu rol no puede actualizar delivery.'; end if;
 if v_order.order_type<>'delivery' then raise exception 'Este pedido no es delivery.'; end if;
 v_status:=lower(trim(coalesce(p_status,''))); if v_status not in ('pending','preparing','ready','on_the_way','delivered','cancelled') then raise exception 'Estado de delivery inválido.'; end if;
 update public.bar_orders set fulfillment_status=v_status where id=v_order.id returning * into v_order; insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'FULFILLMENT_STATUS',jsonb_build_object('status',v_status)); return v_order;
end;$$;

create or replace function public.bar_seat_reservation(p_reservation_id uuid,p_table_id uuid default null)
returns uuid language plpgsql set search_path=public as $$
declare v_res public.bar_reservations%rowtype; v_table public.bar_tables%rowtype; v_order_id uuid; v_table_id uuid;
begin
 select * into v_res from public.bar_reservations where id=p_reservation_id for update; if not found then raise exception 'Reserva no encontrada.'; end if;
 if not public.bar_has_permission(v_res.company_id,'reservation.manage') then raise exception 'Tu rol no puede sentar reservas.'; end if;
 if v_res.status not in ('pending','confirmed') then raise exception 'La reserva ya no está disponible para sentar.'; end if;
 v_table_id:=coalesce(p_table_id,v_res.table_id); if v_table_id is null then raise exception 'Selecciona una mesa.'; end if;
 select * into v_table from public.bar_tables where id=v_table_id and company_id=v_res.company_id and active=true for update; if not found then raise exception 'Mesa no encontrada.'; end if;
 if v_table.status not in ('available','reserved') then raise exception 'La mesa no está disponible.'; end if;
 if exists(select 1 from public.bar_orders where table_id=v_table.id and status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa ya tiene un pedido activo.'; end if;
 insert into public.bar_orders(company_id,table_id,order_type,status,customer_name,customer_phone,guest_count,waiter_id,fulfillment_status,notes) values(v_res.company_id,v_table.id,'table','open',v_res.customer_name,v_res.customer_phone,v_res.party_size,auth.uid(),'pending',v_res.notes) returning id into v_order_id;
 update public.bar_tables set status='occupied' where id=v_table.id; update public.bar_reservations set table_id=v_table.id,status='seated',seated_order_id=v_order_id where id=v_res.id; insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_res.company_id,v_order_id,'RESERVATION_SEATED',jsonb_build_object('reservation_id',v_res.id,'table_id',v_table.id)); return v_order_id;
end;$$;

create or replace function public.bar_take_payment(p_order_id uuid,p_method text,p_amount numeric default null,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_session public.cash_register_sessions%rowtype; v_method text; v_paid numeric; v_due numeric; v_amount numeric; v_account_id uuid; v_account_count integer; v_account_type text; v_payment_id uuid; v_movement_id uuid; v_remaining numeric; v_closed boolean:=false;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into v_order from public.bar_orders where id=p_order_id for update; if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'payment.take') then raise exception 'Tu rol no puede cobrar este pedido.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 v_method:=lower(trim(coalesce(p_method,''))); if v_method not in ('cash','card','transfer','other') then raise exception 'Método de pago no válido.'; end if;
 select * into v_session from public.cash_register_sessions where company_id=v_order.company_id and upper(status)='OPEN' order by opened_at desc limit 1 for update; if not found then raise exception 'Caja cerrada. Abre un turno de caja antes de cobrar.'; end if;
 select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=v_order.id; v_due:=round(greatest(coalesce(v_order.total,0)-v_paid,0),2); if v_due<=0 then raise exception 'El pedido no tiene saldo pendiente.'; end if;
 v_amount:=round(coalesce(p_amount,v_due),2); if v_amount<=0 then raise exception 'Monto de pago inválido.'; end if; if v_amount>v_due then raise exception 'El pago supera el saldo pendiente de %.',v_due; end if;
 if v_method='cash' then v_account_id:=v_session.cash_account_id; elsif v_method in ('card','transfer') then select count(*) into v_account_count from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true; if v_account_count=1 then select id into v_account_id from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true order by id::text limit 1; else v_account_id:=null; end if; else v_account_id:=null; end if;
 insert into public.bar_payments(company_id,order_id,cash_register_session_id,method,amount,reference,received_by,financial_posting_status,financial_note) values(v_order.company_id,v_order.id,v_session.id,v_method,v_amount,nullif(trim(coalesce(p_reference,'')),''),auth.uid(),case when v_account_id is null then 'pending_account' else 'pending' end,case when v_account_id is null then 'Cobro registrado; falta seleccionar cuenta para contabilizarlo.' else null end) returning id into v_payment_id;
 if v_account_id is not null then select upper(coalesce(account_type,'')) into v_account_type from public.cash_accounts where id=v_account_id; insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id) values(v_order.company_id,v_account_id,now(),'INCOME','BAR_SALE',v_payment_id,'IDEALO BAR · '||v_order.order_code,v_amount,nullif(trim(coalesce(p_reference,'')),''),'Cobro '||upper(v_method)||' registrado desde Operación IDEALO BAR.',case when v_account_type in ('CASH','CAJA') then v_session.id else null end) returning id into v_movement_id; update public.bar_payments set cash_movement_id=v_movement_id,financial_posting_status='posted',financial_note='Ingreso contabilizado en Caja/Banco.' where id=v_payment_id; end if;
 v_remaining:=round(greatest(v_due-v_amount,0),2); if v_remaining<=0 then update public.bar_orders set status='paid',closed_at=now(),closed_by=auth.uid(),fulfillment_status=case when order_type='delivery' then fulfillment_status when order_type='takeaway' then 'picked_up' else 'served' end where id=v_order.id; if v_order.table_id is not null then update public.bar_tables set status='available' where id=v_order.table_id and company_id=v_order.company_id; end if; v_closed:=true; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'PAYMENT_RECEIVED',jsonb_build_object('payment_id',v_payment_id,'method',v_method,'amount',v_amount,'remaining',v_remaining,'closed',v_closed)); return jsonb_build_object('payment_id',v_payment_id,'amount',v_amount,'remaining',v_remaining,'closed',v_closed);
end;$$;

grant execute on function public.bar_has_permission(uuid,text) to authenticated;
grant execute on function public.bar_take_payment(uuid,text,numeric,text) to authenticated;
