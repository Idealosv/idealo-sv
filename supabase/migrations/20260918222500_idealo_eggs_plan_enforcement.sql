-- IDEALO Eggs: aplica módulos del plan también en operaciones directas de base de datos.

create or replace function public.egg_module_enabled(p_company_id uuid,p_module_code text)
returns boolean
language plpgsql
stable
security definer
set search_path='public'
as $$
declare v_sub public.saas_company_subscriptions%rowtype; v_override boolean; v_plan_enabled boolean; v_access boolean;
begin
  select * into v_sub from public.saas_company_subscriptions where company_id=p_company_id;
  if not found then return true; end if;

  v_access:=v_sub.status in ('trial','active') or (v_sub.status='past_due' and v_sub.grace_ends_at is not null and v_sub.grace_ends_at>now());
  if not v_access then return false; end if;

  select o.enabled into v_override
  from public.saas_company_module_overrides o
  join public.saas_modules m on m.id=o.module_id
  where o.company_id=p_company_id and m.code=p_module_code
  limit 1;
  if found then return coalesce(v_override,false); end if;

  select pm.enabled into v_plan_enabled
  from public.saas_plan_modules pm
  join public.saas_modules m on m.id=pm.module_id
  where pm.plan_id=v_sub.plan_id and m.code=p_module_code
  limit 1;

  return coalesce(v_plan_enabled,false);
end;
$$;

grant execute on function public.egg_module_enabled(uuid,text) to authenticated,service_role;

create or replace function public.egg_can(p_company_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path='public'
as $$
declare
  v_role text:=public.egg_effective_role(p_company_id,p_user_id);
  p text:=lower(coalesce(p_permission,''));
  v_module text:=null;
begin
  if v_role is null then return false; end if;

  v_module:=case
    when p in ('sales.write','customer.write','inventory.write','supplier.write','classify.write','collections.write') then 'EGG_OPERATIONS'
    when p in ('pricing.write','pricing.read') then 'EGG_PRICING'
    when p='returns.write' then 'EGG_RETURNS'
    when p in ('dispatch.write','route.delivery') then 'EGG_LOGISTICS'
    when p='machine.write' then 'EGG_MACHINE'
    when p='mobile.use' then 'EGG_MOBILE'
    when p='reports.read' then 'EGG_REPORTS'
    when p='users.write' then 'EGG_USERS'
    else null
  end;

  if v_module is not null and not public.egg_module_enabled(p_company_id,v_module) then return false; end if;

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

create or replace function public.egg_start_route_mobile(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_routes where id=p_route_id;
  if v_company is null then raise exception 'Ruta no encontrada.'; end if;
  if not public.egg_can(v_company,'mobile.use') and public.egg_effective_role(v_company) not in ('OWNER','MANAGER') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
  perform public.egg_start_route(p_route_id);
end;
$$;

create or replace function public.egg_deliver_route_stop_mobile(
  p_stop_id uuid,p_received_by text default '',p_collected_amount numeric default 0,
  p_collection_method text default 'CASH',p_collection_reference text default '',p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_route_stops where id=p_stop_id;
  if v_company is null then raise exception 'Parada no encontrada.'; end if;
  if not public.egg_can(v_company,'mobile.use') and public.egg_effective_role(v_company) not in ('OWNER','MANAGER') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
  perform public.egg_deliver_route_stop(p_stop_id,p_received_by,p_collected_amount,p_collection_method,p_collection_reference,p_notes);
end;
$$;

create or replace function public.egg_mark_route_stop_failed_mobile(p_stop_id uuid,p_notes text default '')
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_route_stops where id=p_stop_id;
  if v_company is null then raise exception 'Parada no encontrada.'; end if;
  if not public.egg_can(v_company,'mobile.use') and public.egg_effective_role(v_company) not in ('OWNER','MANAGER') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
  perform public.egg_mark_route_stop_failed(p_stop_id,p_notes);
end;
$$;

grant execute on function public.egg_start_route_mobile(uuid) to authenticated;
grant execute on function public.egg_deliver_route_stop_mobile(uuid,text,numeric,text,text,text) to authenticated;
grant execute on function public.egg_mark_route_stop_failed_mobile(uuid,text) to authenticated;
