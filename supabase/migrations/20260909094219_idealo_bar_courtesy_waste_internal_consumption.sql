create table if not exists public.bar_inventory_events (
  id uuid primary key default gen_random_uuid(),
  event_group_id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null check (event_type in ('COURTESY','WASTE','DAMAGE','INTERNAL')),
  product_id uuid references public.finished_products(id) on delete set null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  reason text not null,
  inventory_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  authorized_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists bar_inventory_events_company_type_date_idx on public.bar_inventory_events(company_id,event_type,created_at desc);
create index if not exists bar_inventory_events_group_idx on public.bar_inventory_events(event_group_id);
create index if not exists bar_inventory_events_product_idx on public.bar_inventory_events(product_id) where product_id is not null;
create index if not exists bar_inventory_events_inventory_idx on public.bar_inventory_events(inventory_item_id);
create index if not exists bar_inventory_events_authorized_by_idx on public.bar_inventory_events(authorized_by) where authorized_by is not null;
create index if not exists bar_inventory_events_created_by_idx on public.bar_inventory_events(created_by) where created_by is not null;
alter table public.bar_inventory_events enable row level security;
drop policy if exists bar_inventory_events_read on public.bar_inventory_events;
create policy bar_inventory_events_read on public.bar_inventory_events for select to authenticated using (public.erp_can_read(company_id));
revoke all on public.bar_inventory_events from anon;
grant select on public.bar_inventory_events to authenticated;
grant all on public.bar_inventory_events to service_role;

create or replace function public.bar_record_product_event(p_company_id uuid,p_product_id uuid,p_quantity numeric,p_event_type text,p_reason text)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare
  v_group uuid := gen_random_uuid(); v_type text := upper(trim(coalesce(p_event_type,''))); v_component record;
  v_qty numeric(12,3); v_movement_id uuid; v_cost numeric(14,4); v_rows integer := 0;
begin
  if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede registrar cortesías o consumo interno.'; end if;
  if v_type not in ('COURTESY','INTERNAL') then raise exception 'Tipo de evento inválido para producto.'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indicá un motivo válido.'; end if;
  if not exists(select 1 from public.finished_products p where p.id=p_product_id and p.company_id=p_company_id and p.active=true) then raise exception 'El producto no pertenece a esta empresa.'; end if;
  for v_component in
    select r.id as recipe_component_id,r.quantity_per_unit,r.waste_percent,i.id as inventory_item_id,i.average_cost,i.warehouse_id,i.location_id
    from public.bar_recipe_components r join public.inventory_items i on i.id=r.inventory_item_id and i.company_id=r.company_id
    where r.company_id=p_company_id and r.product_id=p_product_id and r.active=true and i.active=true and i.deleted_at is null order by r.created_at,r.id
  loop
    v_qty := round((p_quantity*v_component.quantity_per_unit*(1+coalesce(v_component.waste_percent,0)/100))::numeric,3);
    if v_qty<=0 then continue; end if; v_cost := coalesce(v_component.average_cost,0);
    insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,document_type,document_id,reference,notes,created_by)
    values(p_company_id,v_component.inventory_item_id,case when v_type='COURTESY' then 'SALE_OUT' else 'CONSUMPTION' end,v_qty,v_cost,v_component.warehouse_id,v_component.location_id,'IDEALO_BAR_EVENT',v_group,case when v_type='COURTESY' then 'BAR-CORTESIA' else 'BAR-CONSUMO-INTERNO' end,case when v_type='COURTESY' then 'Cortesía: ' else 'Consumo interno: ' end||trim(p_reason),auth.uid()) returning id into v_movement_id;
    insert into public.bar_inventory_events(event_group_id,company_id,event_type,product_id,inventory_item_id,quantity,unit_cost,estimated_cost,reason,inventory_movement_id,authorized_by,created_by)
    values(v_group,p_company_id,v_type,p_product_id,v_component.inventory_item_id,v_qty,v_cost,round((v_qty*v_cost)::numeric,2),trim(p_reason),v_movement_id,auth.uid(),auth.uid());
    v_rows:=v_rows+1;
  end loop;
  if v_rows=0 then raise exception 'El producto no tiene una receta activa vinculada al Inventario.'; end if;
  return v_group;
end;
$$;

create or replace function public.bar_record_inventory_event(p_company_id uuid,p_inventory_item_id uuid,p_quantity numeric,p_event_type text,p_reason text)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare v_group uuid:=gen_random_uuid(); v_type text:=upper(trim(coalesce(p_event_type,''))); v_item public.inventory_items%rowtype; v_movement_id uuid;
begin
  if not public.erp_can_operate(p_company_id) then raise exception 'No tenés permiso operativo para registrar esta salida.'; end if;
  if v_type not in ('WASTE','DAMAGE') then raise exception 'Tipo de evento inválido para inventario.'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indicá un motivo válido.'; end if;
  select * into v_item from public.inventory_items where id=p_inventory_item_id and company_id=p_company_id and active=true and deleted_at is null for update;
  if not found then raise exception 'El insumo no pertenece al inventario activo de esta empresa.'; end if;
  insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,document_type,document_id,reference,notes,created_by)
  values(p_company_id,v_item.id,case when v_type='WASTE' then 'LOSS' else 'DAMAGE' end,p_quantity,coalesce(v_item.average_cost,0),v_item.warehouse_id,v_item.location_id,'IDEALO_BAR_EVENT',v_group,case when v_type='WASTE' then 'BAR-MERMA' else 'BAR-DANIO' end,trim(p_reason),auth.uid()) returning id into v_movement_id;
  insert into public.bar_inventory_events(event_group_id,company_id,event_type,inventory_item_id,quantity,unit_cost,estimated_cost,reason,inventory_movement_id,authorized_by,created_by)
  values(v_group,p_company_id,v_type,v_item.id,p_quantity,coalesce(v_item.average_cost,0),round((p_quantity*coalesce(v_item.average_cost,0))::numeric,2),trim(p_reason),v_movement_id,auth.uid(),auth.uid());
  return v_group;
end;
$$;
revoke execute on function public.bar_record_product_event(uuid,uuid,numeric,text,text) from public,anon;
revoke execute on function public.bar_record_inventory_event(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.bar_record_product_event(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.bar_record_inventory_event(uuid,uuid,numeric,text,text) to authenticated;
