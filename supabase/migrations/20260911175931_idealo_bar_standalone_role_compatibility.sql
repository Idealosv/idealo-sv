-- IDEALO BAR · compatibilidad real de roles para operación independiente del ERP.
-- Corrige puntos donde funciones del BAR todavía dependían exclusivamente de roles ERP genéricos.

create or replace function public.bar_can_view_management(p_company_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
select public.erp_can_read_finance(p_company_id)
   or public.bar_has_permission(p_company_id,'admin.view');
$function$;

revoke execute on function public.bar_can_view_management(uuid) from public, anon;
grant execute on function public.bar_can_view_management(uuid) to authenticated, service_role;

create or replace function public.bar_consume_recipe_on_send()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  r record;
  v_quantity numeric(18,6);
  v_movement_id uuid;
  v_order public.bar_orders%rowtype;
begin
  if not (old.status='new' and new.status='sent') then return new; end if;
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_operate(new.company_id)
     and not public.bar_has_permission(new.company_id,'order.send') then
    raise exception 'Sin permiso para enviar pedidos en IDEALO BAR';
  end if;

  select * into v_order from public.bar_orders where id=new.order_id and company_id=new.company_id;
  if not found then raise exception 'Pedido de bar no válido'; end if;

  for r in
    select rc.*,i.average_cost,i.warehouse_id,i.location_id,i.name as inventory_name
    from public.bar_recipe_components rc
    join public.inventory_items i on i.id=rc.inventory_item_id and i.company_id=rc.company_id
    where rc.company_id=new.company_id and rc.product_id=new.product_id and rc.active=true
    order by rc.created_at,rc.id
  loop
    v_quantity:=round((new.quantity*r.quantity_per_unit*(1+(r.waste_percent/100.0)))::numeric,6);
    if v_quantity<=0 then continue; end if;

    insert into public.inventory_movements(
      company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,
      document_type,document_id,reference,notes,created_by
    ) values (
      new.company_id,r.inventory_item_id,'SALE_OUT',v_quantity,coalesce(r.average_cost,0),r.warehouse_id,r.location_id,
      'BAR_ORDER',new.order_id,coalesce(v_order.order_code,new.order_id::text),
      'IDEALO BAR · '||new.item_name||' · '||r.inventory_name,auth.uid()
    ) returning id into v_movement_id;

    insert into public.bar_inventory_consumptions(
      company_id,order_id,order_item_id,recipe_component_id,inventory_item_id,inventory_movement_id,quantity,unit_cost,created_by
    ) values (
      new.company_id,new.order_id,new.id,r.id,r.inventory_item_id,v_movement_id,v_quantity,coalesce(r.average_cost,0),auth.uid()
    );
  end loop;
  return new;
end;
$function$;

create or replace function public.bar_request_dte(
  p_order_id uuid,
  p_client_id uuid default null,
  p_dte_type text default '01',
  p_environment text default 'test'
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_order public.bar_orders%rowtype;
  v_id uuid;
  v_type text:=trim(coalesce(p_dte_type,'01'));
  v_env text:=lower(trim(coalesce(p_environment,'test')));
begin
  select * into v_order from public.bar_orders where id=p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id)
     and not public.bar_has_permission(v_order.company_id,'payment.take') then
    raise exception 'Sin permiso para solicitar DTE.';
  end if;
  if v_order.status<>'paid' then raise exception 'El pedido debe estar pagado antes de preparar el DTE.'; end if;
  if v_type not in ('01','03') then raise exception 'Tipo de DTE inválido.'; end if;
  if v_env not in ('test','production') then raise exception 'Ambiente DTE inválido.'; end if;
  if v_type='03' and p_client_id is null then raise exception 'El CCF requiere seleccionar un cliente fiscal.'; end if;
  if p_client_id is not null and not exists(
    select 1 from public.clients c
    where c.id=p_client_id and c.company_id=v_order.company_id and c.status='active'
  ) then raise exception 'El cliente no pertenece a esta empresa.'; end if;

  insert into public.bar_dte_requests(
    company_id,order_id,client_id,dte_type,environment,status,requested_by,updated_at
  ) values(
    v_order.company_id,v_order.id,p_client_id,v_type,v_env,'PENDING',auth.uid(),now()
  )
  on conflict(company_id,order_id) do update
    set client_id=excluded.client_id,
        dte_type=excluded.dte_type,
        environment=excluded.environment,
        status=case when public.bar_dte_requests.dte_document_id is null then 'PENDING' else public.bar_dte_requests.status end,
        requested_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.bar_stock_alerts(p_company_id uuid)
returns table(
  inventory_item_id uuid,sku text,name text,unit text,current_stock numeric,available_stock numeric,
  reorder_point numeric,target_stock numeric,suggested_qty numeric,severity text
)
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public.erp_can_read(p_company_id)
     and not public.bar_has_permission(p_company_id,'inventory.view')
     and not public.bar_has_permission(p_company_id,'inventory.manage')
     and not public.bar_has_permission(p_company_id,'admin.view') then
    raise exception 'Sin acceso al inventario del bar.';
  end if;
  return query
  select i.id,i.sku,i.name,i.unit,i.current_stock,
    greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0) as available,
    greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0)) as threshold,
    coalesce(i.target_stock,0),
    greatest(coalesce(i.target_stock,0)-greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0),0) as suggested,
    case when greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=0 then 'CRITICAL' else 'LOW' end
  from public.inventory_items i
  where i.company_id=p_company_id and i.active=true and i.deleted_at is null
    and exists(select 1 from public.bar_recipe_components r where r.company_id=p_company_id and r.inventory_item_id=i.id and r.active=true)
    and greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)
        <= greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0))
  order by case when greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=0 then 0 else 1 end,available asc,i.name;
end;
$function$;

create or replace function public.bar_record_inventory_event(
  p_company_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_event_type text,
  p_reason text
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_group uuid := gen_random_uuid();
  v_type text := upper(trim(coalesce(p_event_type,'')));
  v_item public.inventory_items%rowtype;
  v_movement_id uuid;
begin
  if not public.erp_can_operate(p_company_id)
     and not public.bar_has_permission(p_company_id,'inventory.manage') then
    raise exception 'No tenés permiso para registrar esta salida.';
  end if;
  if v_type not in ('WASTE','DAMAGE') then raise exception 'Tipo de evento inválido para inventario.'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indicá un motivo válido.'; end if;

  select * into v_item from public.inventory_items
  where id=p_inventory_item_id and company_id=p_company_id and active=true and deleted_at is null
  for update;
  if not found then raise exception 'El insumo no pertenece al inventario activo de esta empresa.'; end if;

  insert into public.inventory_movements(
    company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,
    document_type,document_id,reference,notes,created_by
  ) values (
    p_company_id,v_item.id,case when v_type='WASTE' then 'LOSS' else 'DAMAGE' end,p_quantity,
    coalesce(v_item.average_cost,0),v_item.warehouse_id,v_item.location_id,
    'IDEALO_BAR_EVENT',v_group,case when v_type='WASTE' then 'BAR-MERMA' else 'BAR-DANIO' end,
    trim(p_reason),auth.uid()
  ) returning id into v_movement_id;

  insert into public.bar_inventory_events(
    event_group_id,company_id,event_type,inventory_item_id,quantity,unit_cost,estimated_cost,reason,
    inventory_movement_id,authorized_by,created_by
  ) values (
    v_group,p_company_id,v_type,v_item.id,p_quantity,coalesce(v_item.average_cost,0),
    round((p_quantity*coalesce(v_item.average_cost,0))::numeric,2),trim(p_reason),v_movement_id,auth.uid(),auth.uid()
  );
  return v_group;
end;
$function$;

-- Los reportes gerenciales del BAR deben funcionar para Propietario/Gerente del BAR
-- aunque el usuario no tenga un rol financiero genérico del ERP.
do $do$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid,p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'bar_management_dashboard','bar_management_report','bar_daily_close_report',
        'bar_owner_dashboard','bar_product_profitability','bar_staff_performance','bar_advanced_profitability'
      )
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_def:=replace(v_def,'public.erp_can_read_finance(p_company_id)','public.bar_can_view_management(p_company_id)');
    execute v_def;
  end loop;
end;
$do$;
