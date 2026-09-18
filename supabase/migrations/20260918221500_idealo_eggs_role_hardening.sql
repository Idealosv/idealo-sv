-- IDEALO Eggs: permisos finos de rutas, máquina y roles.

create or replace function public.egg_can(p_company_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path='public'
as $$
declare v_role text:=public.egg_effective_role(p_company_id,p_user_id); p text:=lower(coalesce(p_permission,''));
begin
  if v_role is null then return false; end if;
  if v_role in ('OWNER','MANAGER') then return true; end if;
  if p in ('view','reports.read','pricing.read') then return true; end if;
  return case v_role
    when 'SALES' then p in ('sales.write','customer.write')
    when 'WAREHOUSE' then p in ('inventory.write','supplier.write','dispatch.write','returns.write')
    when 'CLASSIFIER' then p in ('classify.write','machine.write','inventory.write')
    when 'DRIVER' then p in ('route.delivery','collections.write','mobile.use')
    when 'CASHIER' then p in ('collections.write')
    when 'VIEWER' then false
    else false
  end;
end;
$$;

create or replace function public.egg_create_route(
  p_company_id uuid,p_route_date date,p_name text default '',p_driver_name text default '',p_vehicle text default '',p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_id uuid; v_code text;
begin
  if not public.egg_can(p_company_id,'dispatch.write') then raise exception 'Sin permiso para crear rutas.'; end if;
  v_id:=gen_random_uuid();
  v_code:='R-'||to_char(coalesce(p_route_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,5));
  insert into public.egg_routes(id,company_id,route_code,route_date,name,driver_name,vehicle,notes,created_by)
  values(v_id,p_company_id,v_code,coalesce(p_route_date,current_date),coalesce(p_name,''),coalesce(p_driver_name,''),coalesce(p_vehicle,''),coalesce(p_notes,''),auth.uid());
  return v_id;
end;
$$;

create or replace function public.egg_add_order_to_route(p_route_id uuid,p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_route public.egg_routes%rowtype; v_order public.egg_orders%rowtype; v_id uuid; v_stop integer;
begin
  select * into v_route from public.egg_routes where id=p_route_id;
  if not found then raise exception 'Ruta no encontrada.'; end if;
  if not public.egg_can(v_route.company_id,'dispatch.write') then raise exception 'Sin permiso para asignar pedidos a rutas.'; end if;
  if v_route.status<>'PLANNED' then raise exception 'Solo se pueden agregar pedidos a una ruta planificada.'; end if;
  select * into v_order from public.egg_orders where id=p_order_id and company_id=v_route.company_id;
  if not found or v_order.status='CANCELLED' then raise exception 'Pedido inválido para esta ruta.'; end if;
  if exists(select 1 from public.egg_route_stops where order_id=p_order_id and status in ('PENDING','DELIVERED')) then raise exception 'El pedido ya está asignado a una ruta.'; end if;
  select coalesce(max(stop_order),0)+1 into v_stop from public.egg_route_stops where route_id=p_route_id;
  insert into public.egg_route_stops(company_id,route_id,order_id,stop_order)
  values(v_route.company_id,p_route_id,p_order_id,v_stop) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.egg_start_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_routes where id=p_route_id;
  if v_company is null then raise exception 'Ruta no encontrada.'; end if;
  if not (public.egg_can(v_company,'dispatch.write') or public.egg_can(v_company,'route.delivery')) then raise exception 'Sin permiso para iniciar la ruta.'; end if;
  if not exists(select 1 from public.egg_route_stops where route_id=p_route_id and status='PENDING') then raise exception 'Agregá al menos un pedido antes de iniciar la ruta.'; end if;
  update public.egg_routes set status='IN_TRANSIT',updated_at=now() where id=p_route_id and status='PLANNED';
end;
$$;

create or replace function public.egg_deliver_route_stop(
  p_stop_id uuid,p_received_by text default '',p_collected_amount numeric default 0,
  p_collection_method text default 'CASH',p_collection_reference text default '',p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_stop public.egg_route_stops%rowtype; v_route_status text; v_pending integer;
begin
  select * into v_stop from public.egg_route_stops where id=p_stop_id;
  if not found then raise exception 'Parada no encontrada.'; end if;
  if not (public.egg_can(v_stop.company_id,'route.delivery') or public.egg_can(v_stop.company_id,'dispatch.write')) then raise exception 'Sin permiso para confirmar entregas.'; end if;
  select status into v_route_status from public.egg_routes where id=v_stop.route_id;
  if v_route_status not in ('PLANNED','IN_TRANSIT') then raise exception 'La ruta no admite entregas en su estado actual.'; end if;
  if v_stop.status='DELIVERED' then raise exception 'Esta entrega ya fue confirmada.'; end if;
  if coalesce(p_collected_amount,0)>0 then perform public.egg_record_payment(v_stop.order_id,p_collected_amount,p_collection_method,p_collection_reference); end if;
  update public.egg_route_stops
  set status='DELIVERED',delivered_at=now(),received_by=coalesce(p_received_by,''),
      collected_amount=coalesce(p_collected_amount,0),
      collection_method=case when coalesce(p_collected_amount,0)>0 then upper(coalesce(p_collection_method,'CASH')) else null end,
      collection_reference=coalesce(p_collection_reference,''),notes=coalesce(p_notes,''),updated_at=now()
  where id=p_stop_id;
  select count(*) into v_pending from public.egg_route_stops where route_id=v_stop.route_id and status='PENDING';
  if v_pending=0 then update public.egg_routes set status='COMPLETED',updated_at=now() where id=v_stop.route_id;
  elsif v_route_status='PLANNED' then update public.egg_routes set status='IN_TRANSIT',updated_at=now() where id=v_stop.route_id; end if;
end;
$$;

-- El importador original queda interno; la versión segura exige rol de clasificación/máquina.
revoke execute on function public.egg_import_weight_events(uuid,uuid,uuid,jsonb,text) from authenticated;

create or replace function public.egg_import_weight_events_secure(
  p_company_id uuid,p_batch_id uuid,p_device_id uuid,p_entries jsonb,p_source text default 'CSV'
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.egg_can(p_company_id,'machine.write') then raise exception 'Sin permiso para importar lecturas de máquina.'; end if;
  return public.egg_import_weight_events(p_company_id,p_batch_id,p_device_id,p_entries,p_source);
end;
$$;

grant execute on function public.egg_import_weight_events_secure(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.egg_create_route(uuid,date,text,text,text,text) to authenticated;
grant execute on function public.egg_add_order_to_route(uuid,uuid) to authenticated;
grant execute on function public.egg_start_route(uuid) to authenticated;
grant execute on function public.egg_deliver_route_stop(uuid,text,numeric,text,text,text) to authenticated;
