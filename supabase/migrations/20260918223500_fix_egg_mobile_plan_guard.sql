-- Fix: el reparto móvil debe respetar plan y rol también para propietarios.
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
  if not public.egg_can(v_company,'mobile.use') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
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
  if not public.egg_can(v_company,'mobile.use') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
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
  if not public.egg_can(v_company,'mobile.use') then raise exception 'El plan o rol no permite reparto móvil.'; end if;
  perform public.egg_mark_route_stop_failed(p_stop_id,p_notes);
end;
$$;

grant execute on function public.egg_start_route_mobile(uuid) to authenticated;
grant execute on function public.egg_deliver_route_stop_mobile(uuid,text,numeric,text,text,text) to authenticated;
grant execute on function public.egg_mark_route_stop_failed_mobile(uuid,text) to authenticated;
