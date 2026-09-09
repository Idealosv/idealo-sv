alter table public.bar_orders
  add column if not exists waiter_id uuid references public.profiles(id) on delete set null,
  add column if not exists guest_count integer not null default 1,
  add column if not exists requested_bill_at timestamptz,
  add column if not exists fulfillment_status text not null default 'pending',
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists manual_discount_reason text,
  add column if not exists discount_authorized_by uuid references public.profiles(id) on delete set null,
  add column if not exists tip_updated_by uuid references public.profiles(id) on delete set null;

alter table public.bar_order_items
  add column if not exists seat_number integer,
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

alter table public.bar_inventory_consumptions
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_movement_id uuid references public.inventory_movements(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='bar_orders_guest_count_check') then
    alter table public.bar_orders add constraint bar_orders_guest_count_check check (guest_count between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='bar_orders_fulfillment_status_check') then
    alter table public.bar_orders add constraint bar_orders_fulfillment_status_check check (fulfillment_status in ('pending','preparing','ready','served','picked_up','on_the_way','delivered','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='bar_order_items_seat_number_check') then
    alter table public.bar_order_items add constraint bar_order_items_seat_number_check check (seat_number is null or seat_number between 1 and 100);
  end if;
end $$;

create index if not exists bar_orders_waiter_id_idx on public.bar_orders(waiter_id);
create index if not exists bar_orders_discount_authorized_by_idx on public.bar_orders(discount_authorized_by);
create index if not exists bar_orders_tip_updated_by_idx on public.bar_orders(tip_updated_by);
create index if not exists bar_inventory_consumptions_reversal_movement_id_idx on public.bar_inventory_consumptions(reversal_movement_id);

create table if not exists public.bar_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_id uuid references public.bar_tables(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  party_size integer not null default 2 check (party_size between 1 and 100),
  reserved_for timestamptz not null,
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 720),
  status text not null default 'pending' check (status in ('pending','confirmed','seated','completed','cancelled','no_show')),
  notes text,
  seated_order_id uuid references public.bar_orders(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bar_reservations_company_time_idx on public.bar_reservations(company_id,reserved_for);
create index if not exists bar_reservations_table_time_idx on public.bar_reservations(table_id,reserved_for) where table_id is not null;
create index if not exists bar_reservations_seated_order_id_idx on public.bar_reservations(seated_order_id) where seated_order_id is not null;
create index if not exists bar_reservations_created_by_idx on public.bar_reservations(created_by) where created_by is not null;

create table if not exists public.bar_order_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.bar_orders(id) on delete cascade,
  event_type text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bar_order_events_order_created_idx on public.bar_order_events(order_id,created_at desc);
create index if not exists bar_order_events_company_created_idx on public.bar_order_events(company_id,created_at desc);
create index if not exists bar_order_events_created_by_idx on public.bar_order_events(created_by) where created_by is not null;

alter table public.bar_reservations enable row level security;
alter table public.bar_order_events enable row level security;

drop policy if exists bar_reservations_read on public.bar_reservations;
create policy bar_reservations_read on public.bar_reservations for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_reservations_insert on public.bar_reservations;
create policy bar_reservations_insert on public.bar_reservations for insert to authenticated with check (public.erp_can_operate(company_id));
drop policy if exists bar_reservations_update on public.bar_reservations;
create policy bar_reservations_update on public.bar_reservations for update to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
drop policy if exists bar_reservations_delete on public.bar_reservations;
create policy bar_reservations_delete on public.bar_reservations for delete to authenticated using (public.erp_can_admin(company_id));

drop policy if exists bar_order_events_read on public.bar_order_events;
create policy bar_order_events_read on public.bar_order_events for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_order_events_insert on public.bar_order_events;
create policy bar_order_events_insert on public.bar_order_events for insert to authenticated with check (public.erp_can_operate(company_id));

grant select,insert,update,delete on public.bar_reservations to authenticated;
grant select,insert on public.bar_order_events to authenticated;
grant all on public.bar_reservations,public.bar_order_events to service_role;

drop trigger if exists bar_reservations_touch_updated_at on public.bar_reservations;
create trigger bar_reservations_touch_updated_at before update on public.bar_reservations for each row execute function public.bar_touch_updated_at();

create or replace function public.bar_update_order_details(
  p_order_id uuid,
  p_waiter_id uuid default null,
  p_guest_count integer default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_driver_name text default null,
  p_driver_phone text default null,
  p_notes text default null
) returns public.bar_orders
language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para modificar este pedido.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  if p_waiter_id is not null and not exists(select 1 from public.company_members m where m.company_id=v_order.company_id and m.user_id=p_waiter_id) then raise exception 'El mesero no pertenece a esta empresa.'; end if;
  if p_guest_count is not null and (p_guest_count<1 or p_guest_count>100) then raise exception 'Cantidad de personas inválida.'; end if;
  update public.bar_orders set
    waiter_id=coalesce(p_waiter_id,waiter_id),
    guest_count=coalesce(p_guest_count,guest_count),
    customer_name=case when p_customer_name is null then customer_name else nullif(trim(p_customer_name),'') end,
    customer_phone=case when p_customer_phone is null then customer_phone else nullif(trim(p_customer_phone),'') end,
    delivery_address=case when p_delivery_address is null then delivery_address else nullif(trim(p_delivery_address),'') end,
    driver_name=case when p_driver_name is null then driver_name else nullif(trim(p_driver_name),'') end,
    driver_phone=case when p_driver_phone is null then driver_phone else nullif(trim(p_driver_phone),'') end,
    notes=case when p_notes is null then notes else nullif(trim(p_notes),'') end
  where id=p_order_id returning * into v_order;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'ORDER_DETAILS_UPDATED',jsonb_build_object('guest_count',v_order.guest_count,'waiter_id',v_order.waiter_id));
  return v_order;
end $$;

create or replace function public.bar_transfer_order_table(p_order_id uuid,p_target_table_id uuid,p_reason text default null)
returns public.bar_orders language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype; v_target public.bar_tables%rowtype; v_source uuid;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para mover esta mesa.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  if v_order.order_type<>'table' then raise exception 'Solo los pedidos de mesa se pueden trasladar.'; end if;
  select * into v_target from public.bar_tables where id=p_target_table_id and company_id=v_order.company_id and active=true for update;
  if not found then raise exception 'Mesa destino no encontrada.'; end if;
  if v_target.status<>'available' then raise exception 'La mesa destino no está disponible.'; end if;
  if exists(select 1 from public.bar_orders o where o.table_id=v_target.id and o.status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa destino ya tiene un pedido activo.'; end if;
  v_source:=v_order.table_id;
  if v_source=p_target_table_id then return v_order; end if;
  update public.bar_orders set table_id=p_target_table_id where id=v_order.id returning * into v_order;
  update public.bar_tables set status='occupied' where id=p_target_table_id;
  if v_source is not null then update public.bar_tables set status='available' where id=v_source and company_id=v_order.company_id; end if;
  insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'TABLE_TRANSFER',nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('from_table_id',v_source,'to_table_id',p_target_table_id));
  return v_order;
end $$;

create or replace function public.bar_set_order_tip(p_order_id uuid,p_tip numeric)
returns public.bar_orders language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para modificar la propina.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  if p_tip is null or p_tip<0 then raise exception 'Propina inválida.'; end if;
  update public.bar_orders set tip_total=round(p_tip,2),tip_updated_by=auth.uid() where id=p_order_id returning * into v_order;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'TIP_UPDATED',jsonb_build_object('tip',v_order.tip_total));
  return v_order;
end $$;

create or replace function public.bar_apply_order_discount(p_order_id uuid,p_mode text,p_value numeric,p_reason text)
returns public.bar_orders language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype; v_discount numeric; v_mode text;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_admin(v_order.company_id) then raise exception 'Solo propietario o administrador puede autorizar descuentos manuales.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'El descuento requiere motivo.'; end if;
  v_mode:=upper(trim(coalesce(p_mode,'')));
  if p_value is null or p_value<0 then raise exception 'Valor de descuento inválido.'; end if;
  if v_mode='PERCENT' then
    if p_value>100 then raise exception 'El porcentaje no puede superar 100%%.'; end if;
    v_discount:=round(v_order.subtotal*p_value/100,2);
  elsif v_mode='AMOUNT' then
    v_discount:=round(p_value,2);
  else raise exception 'Tipo de descuento inválido.'; end if;
  v_discount:=least(v_discount,v_order.subtotal);
  update public.bar_orders set discount_total=v_discount,manual_discount_reason=trim(p_reason),discount_authorized_by=auth.uid() where id=p_order_id returning * into v_order;
  insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'DISCOUNT_APPLIED',trim(p_reason),jsonb_build_object('mode',v_mode,'value',p_value,'discount_total',v_discount));
  return v_order;
end $$;

create or replace function public.bar_void_order_item(p_item_id uuid,p_reason text)
returns public.bar_order_items language plpgsql security invoker set search_path to 'public'
as $$
declare v_item public.bar_order_items%rowtype; v_order public.bar_orders%rowtype; v_cons record; v_return_id uuid;
begin
  select * into v_item from public.bar_order_items where id=p_item_id for update;
  if not found then raise exception 'Producto del pedido no encontrado.'; end if;
  select * into v_order from public.bar_orders where id=v_item.order_id for update;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para anular este producto.'; end if;
  if v_item.status='cancelled' then return v_item; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'La anulación requiere motivo.'; end if;
  if v_item.status<>'new' and not public.erp_can_admin(v_order.company_id) then raise exception 'Un producto ya enviado requiere autorización de propietario o administrador.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  for v_cons in select * from public.bar_inventory_consumptions where order_item_id=v_item.id and reversed_at is null for update loop
    insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,document_type,document_id,reference,notes)
    values(v_cons.company_id,v_cons.inventory_item_id,'RETURN',v_cons.quantity,v_cons.unit_cost,'BAR_VOID',v_item.id,v_order.order_code,'Reversión por anulación operativa en IDEALO BAR: '||trim(p_reason)) returning id into v_return_id;
    update public.bar_inventory_consumptions set reversed_at=now(),reversal_movement_id=v_return_id where id=v_cons.id;
  end loop;
  update public.bar_order_items set status='cancelled',void_reason=trim(p_reason),voided_at=now(),voided_by=auth.uid() where id=v_item.id returning * into v_item;
  insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'ITEM_VOIDED',trim(p_reason),jsonb_build_object('order_item_id',v_item.id,'item_name',v_item.item_name,'quantity',v_item.quantity));
  return v_item;
end $$;

create or replace function public.bar_cancel_order(p_order_id uuid,p_reason text)
returns public.bar_orders language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype; v_cons record; v_return_id uuid; v_has_sent boolean; v_has_payment boolean;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para cancelar este pedido.'; end if;
  if v_order.status='cancelled' then return v_order; end if;
  if v_order.status='paid' then raise exception 'Un pedido pagado debe manejarse mediante devolución, no cancelación.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'La cancelación requiere motivo.'; end if;
  select exists(select 1 from public.bar_order_items where order_id=v_order.id and status not in ('new','cancelled')) into v_has_sent;
  select exists(select 1 from public.bar_payments where order_id=v_order.id) into v_has_payment;
  if (v_has_sent or v_has_payment) and not public.erp_can_admin(v_order.company_id) then raise exception 'Este pedido requiere autorización de propietario o administrador.'; end if;
  if v_has_payment then raise exception 'El pedido ya tiene cobros registrados y no se puede cancelar directamente.'; end if;
  for v_cons in select c.* from public.bar_inventory_consumptions c join public.bar_order_items i on i.id=c.order_item_id where i.order_id=v_order.id and c.reversed_at is null for update loop
    insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,document_type,document_id,reference,notes)
    values(v_cons.company_id,v_cons.inventory_item_id,'RETURN',v_cons.quantity,v_cons.unit_cost,'BAR_CANCEL',v_order.id,v_order.order_code,'Reversión por cancelación de pedido IDEALO BAR: '||trim(p_reason)) returning id into v_return_id;
    update public.bar_inventory_consumptions set reversed_at=now(),reversal_movement_id=v_return_id where id=v_cons.id;
  end loop;
  update public.bar_order_items set status='cancelled',void_reason=trim(p_reason),voided_at=now(),voided_by=auth.uid() where order_id=v_order.id and status<>'cancelled';
  update public.bar_orders set status='cancelled',fulfillment_status='cancelled',closed_at=now(),closed_by=auth.uid() where id=v_order.id returning * into v_order;
  if v_order.table_id is not null then update public.bar_tables set status='available' where id=v_order.table_id and company_id=v_order.company_id; end if;
  insert into public.bar_order_events(company_id,order_id,event_type,reason) values(v_order.company_id,v_order.id,'ORDER_CANCELLED',trim(p_reason));
  return v_order;
end $$;

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
  if v_method='cash' then v_account_id:=v_session.cash_account_id;
  elsif v_method in ('card','transfer') then
    select count(*),min(id) into v_account_count,v_account_id from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true;
    if v_account_count<>1 then v_account_id:=null; end if;
  else v_account_id:=null; end if;
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

create or replace function public.bar_update_fulfillment_status(p_order_id uuid,p_status text)
returns public.bar_orders language plpgsql security invoker set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype; v_status text;
begin
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para actualizar este pedido.'; end if;
  if v_order.status in ('paid','cancelled') and v_order.order_type<>'delivery' then raise exception 'El pedido ya está cerrado.'; end if;
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('pending','preparing','ready','served','picked_up','on_the_way','delivered','cancelled') then raise exception 'Estado operativo inválido.'; end if;
  update public.bar_orders set fulfillment_status=v_status where id=v_order.id returning * into v_order;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'FULFILLMENT_STATUS',jsonb_build_object('status',v_status));
  return v_order;
end $$;

create or replace function public.bar_seat_reservation(p_reservation_id uuid,p_table_id uuid default null)
returns uuid language plpgsql security invoker set search_path to 'public'
as $$
declare v_res public.bar_reservations%rowtype; v_table public.bar_tables%rowtype; v_order_id uuid; v_table_id uuid;
begin
  select * into v_res from public.bar_reservations where id=p_reservation_id for update;
  if not found then raise exception 'Reserva no encontrada.'; end if;
  if not public.erp_can_operate(v_res.company_id) then raise exception 'No tienes permiso para sentar esta reserva.'; end if;
  if v_res.status not in ('pending','confirmed') then raise exception 'La reserva ya no está disponible para sentar.'; end if;
  v_table_id:=coalesce(p_table_id,v_res.table_id);
  if v_table_id is null then raise exception 'Selecciona una mesa.'; end if;
  select * into v_table from public.bar_tables where id=v_table_id and company_id=v_res.company_id and active=true for update;
  if not found then raise exception 'Mesa no encontrada.'; end if;
  if v_table.status not in ('available','reserved') then raise exception 'La mesa no está disponible.'; end if;
  if exists(select 1 from public.bar_orders where table_id=v_table.id and status in ('open','sent','preparing','ready','served')) then raise exception 'La mesa ya tiene un pedido activo.'; end if;
  insert into public.bar_orders(company_id,table_id,order_type,status,customer_name,customer_phone,guest_count,waiter_id,fulfillment_status,notes)
  values(v_res.company_id,v_table.id,'table','open',v_res.customer_name,v_res.customer_phone,v_res.party_size,auth.uid(),'pending',v_res.notes) returning id into v_order_id;
  update public.bar_tables set status='occupied' where id=v_table.id;
  update public.bar_reservations set table_id=v_table.id,status='seated',seated_order_id=v_order_id where id=v_res.id;
  insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_res.company_id,v_order_id,'RESERVATION_SEATED',jsonb_build_object('reservation_id',v_res.id,'table_id',v_table.id));
  return v_order_id;
end $$;

revoke all on function public.bar_update_order_details(uuid,uuid,integer,text,text,text,text,text,text) from public;
revoke all on function public.bar_transfer_order_table(uuid,uuid,text) from public;
revoke all on function public.bar_set_order_tip(uuid,numeric) from public;
revoke all on function public.bar_apply_order_discount(uuid,text,numeric,text) from public;
revoke all on function public.bar_void_order_item(uuid,text) from public;
revoke all on function public.bar_cancel_order(uuid,text) from public;
revoke all on function public.bar_take_payment(uuid,text,numeric,text) from public;
revoke all on function public.bar_update_fulfillment_status(uuid,text) from public;
revoke all on function public.bar_seat_reservation(uuid,uuid) from public;

grant execute on function public.bar_update_order_details(uuid,uuid,integer,text,text,text,text,text,text) to authenticated;
grant execute on function public.bar_transfer_order_table(uuid,uuid,text) to authenticated;
grant execute on function public.bar_set_order_tip(uuid,numeric) to authenticated;
grant execute on function public.bar_apply_order_discount(uuid,text,numeric,text) to authenticated;
grant execute on function public.bar_void_order_item(uuid,text) to authenticated;
grant execute on function public.bar_cancel_order(uuid,text) to authenticated;
grant execute on function public.bar_take_payment(uuid,text,numeric,text) to authenticated;
grant execute on function public.bar_update_fulfillment_status(uuid,text) to authenticated;
grant execute on function public.bar_seat_reservation(uuid,uuid) to authenticated;