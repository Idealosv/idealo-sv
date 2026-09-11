-- IDEALO BAR · protección de mesas con reservas próximas
alter table public.bar_settings add column if not exists reservation_hold_minutes integer not null default 30;
do $$ begin alter table public.bar_settings add constraint bar_settings_reservation_hold_minutes_check check(reservation_hold_minutes between 0 and 240); exception when duplicate_object then null; end $$;

create or replace function public.bar_create_order(p_company_id uuid,p_order_type text,p_table_id uuid default null)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare
 v_type text;v_table public.bar_tables%rowtype;v_order public.bar_orders%rowtype;v_guests int:=1;v_hold int:=30;v_res public.bar_reservations%rowtype;
begin
 if not public.bar_has_permission(p_company_id,'order.create') then raise exception 'Tu rol no puede abrir pedidos.'; end if;
 v_type:=lower(trim(coalesce(p_order_type,'')));
 if v_type not in ('table','takeaway','delivery') then raise exception 'Tipo de pedido inválido.'; end if;
 select default_guest_count,reservation_hold_minutes into v_guests,v_hold from public.bar_settings where company_id=p_company_id;
 v_guests:=coalesce(v_guests,1);v_hold:=coalesce(v_hold,30);
 if v_type='table' then
  if p_table_id is null then raise exception 'Selecciona una mesa.'; end if;
  select * into v_table from public.bar_tables where id=p_table_id and company_id=p_company_id and active=true for update;
  if not found then raise exception 'Mesa no encontrada.'; end if;
  if v_table.status<>'available' then raise exception 'La mesa no está disponible.'; end if;
  if exists(select 1 from public.bar_orders where table_id=p_table_id and status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa ya tiene un pedido activo.'; end if;
  if v_hold>0 then
   select * into v_res
   from public.bar_reservations r
   where r.company_id=p_company_id and r.table_id=p_table_id and r.status in ('pending','confirmed')
     and r.reserved_for<=now()+make_interval(mins=>v_hold)
     and r.reserved_for+make_interval(mins=>coalesce(r.duration_minutes,120))>now()-interval '15 minutes'
   order by r.reserved_for limit 1;
   if found then raise exception 'Mesa reservada para % a las %. Selecciona otra mesa o sentá la reserva.',v_res.customer_name,to_char(v_res.reserved_for at time zone 'America/El_Salvador','HH24:MI'); end if;
  end if;
 elsif p_table_id is not null then raise exception 'Solo los pedidos de mesa pueden recibir mesa.'; end if;
 insert into public.bar_orders(company_id,table_id,order_type,status,waiter_id,guest_count,fulfillment_status)
 values(p_company_id,p_table_id,v_type,'open',auth.uid(),v_guests,'pending') returning * into v_order;
 if p_table_id is not null then update public.bar_tables set status='occupied' where id=p_table_id; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(p_company_id,v_order.id,'ORDER_OPENED',jsonb_build_object('order_type',v_type,'table_id',p_table_id,'bar_role',(public.bar_my_access(p_company_id)->>'role')));
 return v_order;
end;$$;

create or replace function public.bar_transfer_order_table(p_order_id uuid,p_target_table_id uuid,p_reason text default null)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare
 v_order public.bar_orders%rowtype;v_target public.bar_tables%rowtype;v_source uuid;v_hold int:=30;v_res public.bar_reservations%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'table.transfer') then raise exception 'Tu rol no puede mover mesas.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 if v_order.order_type<>'table' then raise exception 'Solo los pedidos de mesa se pueden trasladar.'; end if;
 select * into v_target from public.bar_tables where id=p_target_table_id and company_id=v_order.company_id and active=true for update;if not found then raise exception 'Mesa destino no encontrada.'; end if;
 if v_target.status<>'available' then raise exception 'La mesa destino no está disponible.'; end if;
 if exists(select 1 from public.bar_orders o where o.table_id=v_target.id and o.status not in ('paid','cancelled')) then raise exception 'La mesa destino ya tiene un pedido activo.'; end if;
 select coalesce(reservation_hold_minutes,30) into v_hold from public.bar_settings where company_id=v_order.company_id;
 if coalesce(v_hold,30)>0 then
  select * into v_res from public.bar_reservations r where r.company_id=v_order.company_id and r.table_id=v_target.id and r.status in ('pending','confirmed') and r.reserved_for<=now()+make_interval(mins=>v_hold) and r.reserved_for+make_interval(mins=>coalesce(r.duration_minutes,120))>now()-interval '15 minutes' order by r.reserved_for limit 1;
  if found then raise exception 'La mesa destino está reservada para % a las %.',v_res.customer_name,to_char(v_res.reserved_for at time zone 'America/El_Salvador','HH24:MI'); end if;
 end if;
 v_source:=v_order.table_id;if v_source=p_target_table_id then return v_order; end if;
 perform set_config('idealo.bar_action','table_transfer',true);
 update public.bar_orders set table_id=p_target_table_id where id=v_order.id returning * into v_order;
 update public.bar_tables set status=case when v_order.requested_bill_at is null then 'occupied' else 'awaiting_payment' end where id=p_target_table_id;
 if v_source is not null then update public.bar_tables set status='available' where id=v_source and company_id=v_order.company_id; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'TABLE_TRANSFER',nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('from_table_id',v_source,'to_table_id',p_target_table_id));
 return v_order;
end;$$;
