-- IDEALO BAR · control de turno, recuperación segura y endurecimiento de comandos
-- Evita cambios directos que desincronicen mesa/pedido y agrega un centro de turno auditable.

-- 1) Pedidos: para roles operativos, los campos sensibles solo cambian por los RPC oficiales.
create or replace function public.bar_guard_order_role_update()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_changed text[];
  v_action text;
  v_paid numeric:=0;
begin
  if auth.uid() is null or pg_trigger_depth()>1 or public.bar_has_permission(new.company_id,'admin.manage') then
    return new;
  end if;

  select coalesce(array_agg(j.key order by j.key),array[]::text[]) into v_changed
  from jsonb_each(to_jsonb(new)) j
  where j.value is distinct from (to_jsonb(old)->j.key);
  v_action:=coalesce(current_setting('idealo.bar_action',true),'');

  if v_action='cancel_order' and public.bar_has_permission(new.company_id,'order.cancel') then
    return new;
  end if;

  -- Cerrar como pagado solo es válido cuando el cobro ya existe y cubre el total.
  if public.bar_has_permission(new.company_id,'payment.take')
     and v_changed <@ array['status','closed_at','closed_by','fulfillment_status','updated_at']::text[]
     and new.status='paid' and old.status<>'paid' then
    select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=new.id;
    if v_paid+0.01>=coalesce(new.total,0) and new.closed_by=auth.uid() then return new; end if;
    raise exception 'No se puede cerrar el pedido sin un cobro válido que cubra el total.';
  end if;

  if v_action='set_tip' and public.bar_has_permission(new.company_id,'tip.manage')
     and v_changed <@ array['tip_total','tip_updated_by','updated_at']::text[] then return new; end if;

  if v_action='request_bill' and public.bar_has_permission(new.company_id,'bill.request')
     and v_changed <@ array['requested_bill_at','updated_at']::text[] then return new; end if;

  if v_action='fulfillment' and public.bar_has_permission(new.company_id,'delivery.manage')
     and v_changed <@ array['fulfillment_status','delivery_preparing_at','delivery_ready_at','delivery_out_at','delivery_delivered_at','updated_at']::text[] then return new; end if;

  if v_action='table_transfer' and public.bar_has_permission(new.company_id,'table.transfer')
     and v_changed <@ array['table_id','updated_at']::text[] then return new; end if;

  -- Edición normal del mesero: datos descriptivos, nunca estados, cobros, propinas ni mesa.
  if public.bar_has_permission(new.company_id,'order.edit')
     and v_changed <@ array['waiter_id','guest_count','customer_name','customer_phone','delivery_address','driver_name','driver_phone','notes','updated_at']::text[] then
    return new;
  end if;

  -- Delivery puede editar datos de despacho sin saltarse la transición auditada del estado.
  if public.bar_has_permission(new.company_id,'delivery.manage')
     and v_changed <@ array['driver_name','driver_phone','customer_name','customer_phone','delivery_address','notes','updated_at']::text[] then
    return new;
  end if;

  raise exception 'Este cambio debe realizarse desde la acción oficial de IDEALO BAR.';
end;
$$;
revoke execute on function public.bar_guard_order_role_update() from public,anon,authenticated;

-- 2) Mesas: un rol operativo solo puede cambiar el ESTADO cuando coincide con la realidad del pedido.
create or replace function public.bar_guard_table_role_update()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_changed text[];
  v_has_active boolean;
  v_has_bill boolean;
  v_has_reservation boolean;
begin
  if auth.uid() is null or public.bar_has_permission(new.company_id,'admin.manage') or public.bar_has_permission(new.company_id,'setup.manage') then
    return new;
  end if;

  select coalesce(array_agg(j.key order by j.key),array[]::text[]) into v_changed
  from jsonb_each(to_jsonb(new)) j
  where j.value is distinct from (to_jsonb(old)->j.key);

  if not (v_changed <@ array['status','updated_at']::text[]) then
    raise exception 'Tu rol no puede modificar la estructura de la mesa.';
  end if;

  select exists(select 1 from public.bar_orders o where o.table_id=new.id and o.company_id=new.company_id and o.status not in ('paid','cancelled')),
         exists(select 1 from public.bar_orders o where o.table_id=new.id and o.company_id=new.company_id and o.status not in ('paid','cancelled') and o.requested_bill_at is not null)
    into v_has_active,v_has_bill;

  if new.status='occupied' then
    if v_has_active then return new; end if;
    raise exception 'No se puede ocupar una mesa sin pedido activo.';
  elsif new.status='awaiting_payment' then
    if v_has_bill then return new; end if;
    raise exception 'La mesa solo puede pasar a cobro cuando existe una cuenta solicitada.';
  elsif new.status='available' then
    if not v_has_active then return new; end if;
    raise exception 'No se puede liberar una mesa que todavía tiene un pedido activo.';
  elsif new.status='reserved' then
    select exists(
      select 1 from public.bar_reservations r
      where r.company_id=new.company_id and r.table_id=new.id and r.status in ('pending','confirmed')
        and r.reserved_for between now()-interval '2 hours' and now()+interval '12 hours'
    ) into v_has_reservation;
    if public.bar_has_permission(new.company_id,'reservation.manage') and v_has_reservation then return new; end if;
    raise exception 'No se puede reservar la mesa sin una reserva vigente.';
  elsif new.status=old.status then
    return new;
  end if;

  raise exception 'Transición de mesa no permitida.';
end;
$$;
revoke execute on function public.bar_guard_table_role_update() from public,anon,authenticated;
drop trigger if exists zz_bar_tables_role_update_guard on public.bar_tables;
create trigger zz_bar_tables_role_update_guard
before update on public.bar_tables
for each row execute function public.bar_guard_table_role_update();

-- 3) Acciones oficiales: marcan el contexto para que el guard de pedidos pueda distinguir un RPC de un UPDATE manual.
create or replace function public.bar_set_order_tip(p_order_id uuid,p_tip numeric)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'tip.manage') then raise exception 'Tu rol no puede modificar la propina.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 if p_tip is null or p_tip<0 then raise exception 'Propina inválida.'; end if;
 perform set_config('idealo.bar_action','set_tip',true);
 update public.bar_orders set tip_total=round(p_tip,2),tip_updated_by=auth.uid() where id=p_order_id returning * into v_order;
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'TIP_UPDATED',jsonb_build_object('tip',v_order.tip_total));
 perform public.bar_reconcile_existing_tip(v_order.id);
 return v_order;
end;
$$;

create or replace function public.bar_request_bill(p_order_id uuid)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'bill.request') then raise exception 'Tu rol no puede solicitar la cuenta.'; end if;
 if v_order.table_id is null then raise exception 'Este pedido no está en una mesa.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 perform set_config('idealo.bar_action','request_bill',true);
 -- Primero el pedido; después la mesa. Así la mesa nunca entra a cobro sin una solicitud real.
 update public.bar_orders set requested_bill_at=coalesce(requested_bill_at,now()) where id=v_order.id returning * into v_order;
 update public.bar_tables set status='awaiting_payment' where id=v_order.table_id and company_id=v_order.company_id;
 if not exists(select 1 from public.bar_order_events e where e.order_id=v_order.id and e.event_type='BILL_REQUESTED') then
   insert into public.bar_order_events(company_id,order_id,event_type) values(v_order.company_id,v_order.id,'BILL_REQUESTED');
 end if;
 return v_order;
end;
$$;

create or replace function public.bar_transfer_order_table(p_order_id uuid,p_target_table_id uuid,p_reason text default null)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;v_target public.bar_tables%rowtype;v_source uuid;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'table.transfer') then raise exception 'Tu rol no puede mover mesas.'; end if;
 if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
 if v_order.order_type<>'table' then raise exception 'Solo los pedidos de mesa se pueden trasladar.'; end if;
 select * into v_target from public.bar_tables where id=p_target_table_id and company_id=v_order.company_id and active=true for update;
 if not found then raise exception 'Mesa destino no encontrada.'; end if;
 if v_target.status<>'available' then raise exception 'La mesa destino no está disponible.'; end if;
 if exists(select 1 from public.bar_orders o where o.table_id=v_target.id and o.status not in ('paid','cancelled')) then raise exception 'La mesa destino ya tiene un pedido activo.'; end if;
 v_source:=v_order.table_id;
 if v_source=p_target_table_id then return v_order; end if;
 perform set_config('idealo.bar_action','table_transfer',true);
 update public.bar_orders set table_id=p_target_table_id where id=v_order.id returning * into v_order;
 update public.bar_tables set status=case when v_order.requested_bill_at is null then 'occupied' else 'awaiting_payment' end where id=p_target_table_id;
 if v_source is not null then update public.bar_tables set status='available' where id=v_source and company_id=v_order.company_id; end if;
 insert into public.bar_order_events(company_id,order_id,event_type,reason,details)
 values(v_order.company_id,v_order.id,'TABLE_TRANSFER',nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('from_table_id',v_source,'to_table_id',p_target_table_id));
 return v_order;
end;
$$;

create or replace function public.bar_update_fulfillment_status(p_order_id uuid,p_status text)
returns public.bar_orders
language plpgsql
set search_path to 'public'
as $$
declare v_order public.bar_orders%rowtype;v_status text;
begin
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'delivery.manage') and not public.erp_can_admin(v_order.company_id) then raise exception 'Tu rol no puede actualizar delivery.'; end if;
 if v_order.order_type<>'delivery' then raise exception 'Este pedido no es delivery.'; end if;
 if v_order.status='cancelled' then raise exception 'El pedido está cancelado.'; end if;
 v_status:=lower(trim(coalesce(p_status,'')));
 if v_status not in ('pending','preparing','ready','on_the_way','delivered','cancelled') then raise exception 'Estado de delivery inválido.'; end if;
 if v_order.fulfillment_status='delivered' and v_status<>'delivered' then raise exception 'Un delivery entregado no puede retroceder de estado.'; end if;
 perform set_config('idealo.bar_action','fulfillment',true);
 update public.bar_orders set
   fulfillment_status=v_status,
   delivery_preparing_at=case when v_status='preparing' and delivery_preparing_at is null then now() else delivery_preparing_at end,
   delivery_ready_at=case when v_status='ready' and delivery_ready_at is null then now() else delivery_ready_at end,
   delivery_out_at=case when v_status='on_the_way' and delivery_out_at is null then now() else delivery_out_at end,
   delivery_delivered_at=case when v_status='delivered' and delivery_delivered_at is null then now() else delivery_delivered_at end
 where id=v_order.id returning * into v_order;
 insert into public.bar_delivery_events(company_id,order_id,status,driver_name,driver_phone) values(v_order.company_id,v_order.id,v_status,v_order.driver_name,v_order.driver_phone);
 insert into public.bar_order_events(company_id,order_id,event_type,details) values(v_order.company_id,v_order.id,'FULFILLMENT_STATUS',jsonb_build_object('status',v_status));
 return v_order;
end;
$$;

-- 4) Registro de entrega de turno. Guarda una foto auditable del estado del negocio.
create table if not exists public.bar_shift_handoffs(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 cash_register_session_id uuid references public.cash_register_sessions(id) on delete set null,
 note text not null,
 snapshot jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists bar_shift_handoffs_company_created_idx on public.bar_shift_handoffs(company_id,created_at desc);
alter table public.bar_shift_handoffs enable row level security;
drop policy if exists bar_shift_handoffs_read on public.bar_shift_handoffs;
drop policy if exists bar_shift_handoffs_insert on public.bar_shift_handoffs;
drop policy if exists bar_shift_handoffs_delete on public.bar_shift_handoffs;
create policy bar_shift_handoffs_read on public.bar_shift_handoffs for select to authenticated
using (public.bar_has_permission(company_id,'cash.view') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_shift_handoffs_insert on public.bar_shift_handoffs for insert to authenticated
with check (public.bar_has_permission(company_id,'cash.cut') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_shift_handoffs_delete on public.bar_shift_handoffs for delete to authenticated
using (public.bar_has_permission(company_id,'admin.manage'));

create or replace function public.bar_shift_snapshot(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
 v_now timestamptz:=now();
 v_day date:=(now() at time zone 'America/El_Salvador')::date;
 v_session public.cash_register_sessions%rowtype;
 v_open_orders int;v_station_pending int;v_pending_postings int;v_pending_dte int;v_low_stock int;v_stale_print int;
 v_today_sales numeric;v_today_tips numeric;v_cash numeric;v_card numeric;v_transfer numeric;v_other numeric;
 v_open_payload jsonb;v_res_payload jsonb;v_session_payload jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'cash.view') and not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then
   raise exception 'Tu rol no puede consultar el control de turno.';
 end if;

 select * into v_session from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN' order by opened_at desc limit 1;
 select count(*) into v_open_orders from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled');
 select count(*) into v_station_pending from public.bar_order_items where company_id=p_company_id and status in ('sent','preparing','ready');
 select count(*) into v_pending_postings from public.bar_payments where company_id=p_company_id and financial_posting_status<>'posted';
 select count(*) into v_pending_dte from public.dte_documents where company_id=p_company_id and bar_order_id is not null and status in ('DRAFT','SIGNING','SIGNED','TRANSMITTING','TRANSMISSION_UNKNOWN','REJECTED');
 select count(*) into v_stale_print from public.bar_print_jobs where company_id=p_company_id and status='PENDING' and created_at<v_now-interval '15 minutes';
 select count(*) into v_low_stock from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null
   and exists(select 1 from public.bar_recipe_components r where r.company_id=p_company_id and r.inventory_item_id=i.id and r.active=true)
   and greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0));
 select coalesce(sum(total),0),coalesce(sum(tip_total),0) into v_today_sales,v_today_tips
 from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=v_day;
 select
  coalesce(sum(amount) filter(where method='cash'),0),
  coalesce(sum(amount) filter(where method='card'),0),
  coalesce(sum(amount) filter(where method='transfer'),0),
  coalesce(sum(amount) filter(where method not in ('cash','card','transfer')),0)
 into v_cash,v_card,v_transfer,v_other
 from public.bar_payments where company_id=p_company_id and (created_at at time zone 'America/El_Salvador')::date=v_day;

 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'order_code',o.order_code,'type',o.order_type,'status',o.status,'table_id',o.table_id,'total',o.total,'opened_at',o.opened_at,'requested_bill_at',o.requested_bill_at) order by o.opened_at),'[]'::jsonb)
 into v_open_payload from (select * from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled') order by opened_at limit 30) o;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'customer_name',r.customer_name,'party_size',r.party_size,'reserved_for',r.reserved_for,'table_id',r.table_id,'status',r.status) order by r.reserved_for),'[]'::jsonb)
 into v_res_payload from (select * from public.bar_reservations where company_id=p_company_id and status in ('pending','confirmed') and reserved_for between v_now-interval '1 hour' and v_now+interval '6 hours' order by reserved_for limit 30) r;

 if v_session.id is null then v_session_payload:=null;
 else
   v_session_payload:=jsonb_build_object(
    'id',v_session.id,'business_date',v_session.business_date,'opening_balance',v_session.opening_balance,'opened_at',v_session.opened_at,'opened_by',v_session.opened_by,
    'cash_account_id',v_session.cash_account_id,
    'cash_collected',coalesce((select sum(p.amount) from public.bar_payments p where p.cash_register_session_id=v_session.id and p.method='cash'),0),
    'all_collected',coalesce((select sum(p.amount) from public.bar_payments p where p.cash_register_session_id=v_session.id),0),
    'manual_income',coalesce((select sum(m.amount) from public.cash_movements m where m.cash_register_session_id=v_session.id and m.movement_type='INCOME' and m.source_type='MANUAL'),0),
    'manual_expense',coalesce((select sum(m.amount) from public.cash_movements m where m.cash_register_session_id=v_session.id and m.movement_type='EXPENSE' and m.source_type='MANUAL'),0)
   );
 end if;

 return jsonb_build_object(
  'business_date',v_day,'checked_at',v_now,'cash_session',v_session_payload,
  'open_orders',v_open_orders,'station_pending',v_station_pending,'pending_cash_postings',v_pending_postings,'pending_dte',v_pending_dte,'low_stock_items',v_low_stock,'stale_print_jobs',v_stale_print,
  'today_sales',v_today_sales,'today_tips',v_today_tips,
  'payments',jsonb_build_object('cash',v_cash,'card',v_card,'transfer',v_transfer,'other',v_other,'total',v_cash+v_card+v_transfer+v_other),
  'open_order_list',v_open_payload,'upcoming_reservations',v_res_payload,
  'operational_clear',v_station_pending=0 and v_stale_print=0,
  'cash_close_ready',v_open_orders=0 and v_station_pending=0 and v_pending_postings=0,
  'needs_attention',v_pending_postings+v_pending_dte+v_low_stock+v_stale_print
 );
end;
$$;
revoke execute on function public.bar_shift_snapshot(uuid) from public,anon;
grant execute on function public.bar_shift_snapshot(uuid) to authenticated;

create or replace function public.bar_create_shift_handoff(p_company_id uuid,p_note text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;v_session uuid;v_snapshot jsonb;v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'cash.cut') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Tu rol no puede registrar entrega de turno.'; end if;
 if v_note is null or char_length(v_note)<3 then raise exception 'Escribe una nota breve para la entrega de turno.'; end if;
 select id into v_session from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN' order by opened_at desc limit 1;
 v_snapshot:=public.bar_shift_snapshot(p_company_id);
 insert into public.bar_shift_handoffs(company_id,cash_register_session_id,note,snapshot,created_by) values(p_company_id,v_session,v_note,v_snapshot,auth.uid()) returning id into v_id;
 return v_id;
end;
$$;
revoke execute on function public.bar_create_shift_handoff(uuid,text) from public,anon;
grant execute on function public.bar_create_shift_handoff(uuid,text) to authenticated;

-- 5) Reparación segura: únicamente estados deducibles, divisiones cerradas y comandas faltantes.
create or replace function public.bar_safe_repair(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tables_busy int:=0;v_tables_bill int:=0;v_tables_free int:=0;v_splits int:=0;v_jobs int:=0;v_rank jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede ejecutar la reparación segura.'; end if;

 update public.bar_bill_splits s set status='CANCELLED',updated_at=now()
 where s.company_id=p_company_id and s.status='OPEN' and exists(select 1 from public.bar_orders o where o.id=s.order_id and o.status in ('paid','cancelled'));
 get diagnostics v_splits=row_count;

 update public.bar_tables t set status='awaiting_payment'
 where t.company_id=p_company_id and t.active=true and t.status<>'awaiting_payment'
   and exists(select 1 from public.bar_orders o where o.table_id=t.id and o.company_id=t.company_id and o.status not in ('paid','cancelled') and o.requested_bill_at is not null);
 get diagnostics v_tables_bill=row_count;

 update public.bar_tables t set status='occupied'
 where t.company_id=p_company_id and t.active=true and t.status not in ('occupied','awaiting_payment')
   and exists(select 1 from public.bar_orders o where o.table_id=t.id and o.company_id=t.company_id and o.status not in ('paid','cancelled') and o.requested_bill_at is null);
 get diagnostics v_tables_busy=row_count;

 update public.bar_tables t set status='available'
 where t.company_id=p_company_id and t.active=true and t.status in ('occupied','awaiting_payment')
   and not exists(select 1 from public.bar_orders o where o.table_id=t.id and o.company_id=t.company_id and o.status not in ('paid','cancelled'));
 get diagnostics v_tables_free=row_count;

 insert into public.bar_print_jobs(company_id,order_id,station,ticket_type,payload,printer_name,status,created_by)
 select i.company_id,i.order_id,i.station,'COMMAND',
   jsonb_build_object('order_code',o.order_code,'order_type',o.order_type,'table_id',o.table_id,'customer_name',o.customer_name,'item_id',i.id,'item_name',i.item_name,'quantity',i.quantity,'notes',i.notes,'sent_at',i.updated_at),
   case when i.station='kitchen' then s.kitchen_printer_name else s.bar_printer_name end,'PENDING',auth.uid()
 from public.bar_order_items i
 join public.bar_orders o on o.id=i.order_id and o.company_id=i.company_id
 left join public.bar_settings s on s.company_id=i.company_id
 where i.company_id=p_company_id and i.station in ('kitchen','bar') and i.status in ('sent','preparing','ready') and i.created_at>now()-interval '24 hours'
   and not exists(select 1 from public.bar_print_jobs j where j.company_id=i.company_id and j.order_id=i.order_id and j.payload->>'item_id'=i.id::text);
 get diagnostics v_jobs=row_count;

 v_rank:=public.bar_refresh_menu_popularity(p_company_id);
 insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id)
 values(p_company_id,'SYSTEM','SAFE_REPAIR','company',p_company_id::text,jsonb_build_object('tables_bill',v_tables_bill,'tables_busy',v_tables_busy,'tables_free',v_tables_free,'splits_closed',v_splits,'print_jobs_recovered',v_jobs),auth.uid());
 return jsonb_build_object('tables_to_bill',v_tables_bill,'tables_to_occupied',v_tables_busy,'tables_to_available',v_tables_free,'splits_closed',v_splits,'print_jobs_recovered',v_jobs,'ranking',v_rank);
end;
$$;
revoke execute on function public.bar_safe_repair(uuid) from public,anon;
grant execute on function public.bar_safe_repair(uuid) to authenticated;

-- 6) Índices del centro de turno y comandos calientes.
create index if not exists bar_orders_company_status_opened_idx on public.bar_orders(company_id,status,opened_at desc);
create index if not exists bar_order_items_company_status_station_idx on public.bar_order_items(company_id,status,station,updated_at desc);
create index if not exists bar_shift_handoffs_session_idx on public.bar_shift_handoffs(cash_register_session_id,created_at desc);
create index if not exists bar_reservations_company_upcoming_idx on public.bar_reservations(company_id,reserved_for) where status in ('pending','confirmed');
