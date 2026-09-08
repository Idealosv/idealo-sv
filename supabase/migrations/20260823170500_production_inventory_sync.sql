-- IDEALO SV · Producción -> Inventario
-- Reserva real por OT, consumo transaccional al iniciar producción, Kardex y costo real.

alter table public.production_material_requirements
  add column if not exists reservation_id uuid references public.inventory_reservations(id) on delete set null;

create index if not exists production_material_reservation_idx
  on public.production_material_requirements(reservation_id)
  where reservation_id is not null;

alter table public.work_order_costs
  add column if not exists source_type text,
  add column if not exists source_id uuid;

alter table public.work_order_costs drop constraint if exists work_order_costs_cost_type_check;
alter table public.work_order_costs
  add constraint work_order_costs_cost_type_check
  check (cost_type in ('MATERIAL','LABOR','OUTSOURCED','TRANSPORT','INSTALLATION','DESIGN','OTHER')) not valid;
alter table public.work_order_costs validate constraint work_order_costs_cost_type_check;

create unique index if not exists work_order_costs_source_unique
  on public.work_order_costs(work_order_id,source_type,source_id)
  where source_id is not null;

alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'PURCHASE_IN','CONSUMPTION','ADJUST_IN','ADJUST_OUT','RETURN','SALE_OUT',
    'TRANSFER_OUT','DAMAGE','LOSS','EXPIRY','SUPPLIER_RETURN','PRODUCTION_OUT',
    'INSTALLATION_OUT','PRODUCTION_IN','TRANSFER_IN','INITIAL'
  )) not valid;
alter table public.inventory_movements validate constraint inventory_movements_movement_type_check;

create or replace function public.sync_production_material_inventory()
returns trigger
language plpgsql
security invoker
set search_path='public'
as $$
declare
  v_item public.inventory_items%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_existing_remaining numeric(18,3) := 0;
  v_available numeric(18,3) := 0;
  v_requested numeric(18,3) := 0;
begin
  -- Vinculación automática segura por SKU o nombre exacto dentro de la misma empresa.
  if new.inventory_item_id is null and nullif(btrim(new.material_name),'') is not null then
    select i.* into v_item
    from public.inventory_items i
    where i.company_id=new.company_id
      and i.active=true
      and i.deleted_at is null
      and (lower(btrim(i.name))=lower(btrim(new.material_name)) or lower(coalesce(i.sku,''))=lower(btrim(new.material_name)))
    order by case when lower(btrim(i.name))=lower(btrim(new.material_name)) then 0 else 1 end
    limit 1;
    if found then new.inventory_item_id:=v_item.id; end if;
  end if;

  if new.inventory_item_id is null then
    -- Nunca permitir una reserva ficticia sin artículo de inventario.
    if tg_op='INSERT' then
      new.reserved_qty:=0;
    elsif new.reserved_qty>old.reserved_qty then
      new.reserved_qty:=old.reserved_qty;
    end if;
    if new.status='READY' then new.status:='PENDING'; end if;
    return new;
  end if;

  select * into v_item
  from public.inventory_items
  where id=new.inventory_item_id and company_id=new.company_id and active=true and deleted_at is null
  for update;
  if not found then raise exception 'El material de producción no pertenece al inventario activo de esta empresa'; end if;

  if coalesce(new.unit_cost,0)<=0 then new.unit_cost:=coalesce(v_item.average_cost,0); end if;
  if nullif(new.unit,'') is null then new.unit:=v_item.unit; end if;

  v_requested:=greatest(coalesce(new.reserved_qty,0)-coalesce(new.consumed_qty,0),0);

  if new.reservation_id is not null then
    select * into v_reservation from public.inventory_reservations where id=new.reservation_id for update;
    if found then v_existing_remaining:=greatest(v_reservation.quantity-v_reservation.consumed_quantity,0); end if;
  end if;

  if v_requested>0 then
    v_available:=greatest(coalesce(v_item.current_stock,0)-coalesce(v_item.reserved_stock,0)+v_existing_remaining,0);
    if v_requested>v_available then
      raise exception 'Stock insuficiente para reservar %: disponible %, solicitado %',new.material_name,v_available,v_requested;
    end if;

    if new.reservation_id is null then
      insert into public.inventory_reservations(
        company_id,inventory_item_id,work_order_id,warehouse_id,location_id,quantity,consumed_quantity,status,priority,notes,created_by
      ) values (
        new.company_id,new.inventory_item_id,new.work_order_id,v_item.warehouse_id,v_item.location_id,
        new.reserved_qty,coalesce(new.consumed_qty,0),'ACTIVE','NORMAL',
        'Reserva automática desde Producción',auth.uid()
      ) returning id into new.reservation_id;
    else
      update public.inventory_reservations
      set inventory_item_id=new.inventory_item_id,
          work_order_id=new.work_order_id,
          quantity=new.reserved_qty,
          consumed_quantity=least(coalesce(new.consumed_qty,0),new.reserved_qty),
          status=case when coalesce(new.consumed_qty,0)>=new.reserved_qty then 'CONSUMED' else 'ACTIVE' end,
          updated_at=now()
      where id=new.reservation_id;
    end if;
  elsif new.reservation_id is not null then
    update public.inventory_reservations
    set consumed_quantity=least(coalesce(new.consumed_qty,0),quantity),
        status=case when coalesce(new.consumed_qty,0)>=quantity then 'CONSUMED' else 'RELEASED' end,
        updated_at=now()
    where id=new.reservation_id;
  end if;

  perform public.refresh_inventory_reserved_stock(new.inventory_item_id);
  return new;
end;
$$;

revoke all on function public.sync_production_material_inventory() from public,anon;
grant execute on function public.sync_production_material_inventory() to authenticated;

drop trigger if exists trg_sync_production_material_inventory on public.production_material_requirements;
create trigger trg_sync_production_material_inventory
before insert or update of inventory_item_id,material_name,required_qty,reserved_qty,consumed_qty,status
on public.production_material_requirements
for each row execute function public.sync_production_material_inventory();

create or replace function public.consume_work_order_inventory_on_production()
returns trigger
language plpgsql
security invoker
set search_path='public'
as $$
declare
  r record;
  v_qty numeric(18,3);
  v_cost numeric(18,4);
  v_total numeric(14,2);
begin
  if new.status<>'PRODUCTION' or old.status='PRODUCTION' then return new; end if;

  for r in
    select pm.*,i.average_cost,i.current_stock
    from public.production_material_requirements pm
    left join public.inventory_items i on i.id=pm.inventory_item_id and i.company_id=pm.company_id
    where pm.work_order_id=new.id and coalesce(pm.required_qty,0)>coalesce(pm.consumed_qty,0)
    order by pm.created_at,pm.id
  loop
    if r.inventory_item_id is null then
      raise exception 'El material % no está vinculado al Inventario',r.material_name;
    end if;
    if coalesce(r.reserved_qty,0)<coalesce(r.required_qty,0) then
      raise exception 'El material % no está completamente reservado',r.material_name;
    end if;

    v_qty:=r.required_qty-r.consumed_qty;
    v_cost:=coalesce(nullif(r.unit_cost,0),r.average_cost,0);

    insert into public.inventory_movements(
      company_id,inventory_item_id,movement_type,quantity,unit_cost,work_order_id,
      warehouse_id,location_id,reservation_id,document_type,document_id,reference,notes,created_by
    ) values (
      new.company_id,r.inventory_item_id,'PRODUCTION_OUT',v_qty,v_cost,new.id,
      (select warehouse_id from public.inventory_items where id=r.inventory_item_id),
      (select location_id from public.inventory_items where id=r.inventory_item_id),
      r.reservation_id,'WORK_ORDER',new.id,
      'OT-'||coalesce(new.number::text,new.id::text),
      'Consumo automático de '||r.material_name||' al iniciar producción',auth.uid()
    );

    update public.production_material_requirements
    set consumed_qty=required_qty,status='CONSUMED',unit_cost=v_cost,updated_at=now()
    where id=r.id;

    if r.reservation_id is not null then
      update public.inventory_reservations
      set consumed_quantity=quantity,status='CONSUMED',updated_at=now()
      where id=r.reservation_id;
    end if;

    perform public.refresh_inventory_reserved_stock(r.inventory_item_id);

    insert into public.work_order_costs(company_id,work_order_id,cost_type,concept,amount,notes,incurred_at,source_type,source_id)
    values(new.company_id,new.id,'MATERIAL',r.material_name,round((v_qty*v_cost)::numeric,2),'Consumo automático desde Inventario',current_date,'PRODUCTION_MATERIAL',r.id)
    on conflict (work_order_id,source_type,source_id) where source_id is not null
    do update set amount=excluded.amount,concept=excluded.concept,notes=excluded.notes,updated_at=now();
  end loop;

  select coalesce(sum(c.amount),0) into v_total from public.work_order_costs c where c.work_order_id=new.id;
  update public.work_orders set actual_cost=v_total where id=new.id;
  return new;
end;
$$;

revoke all on function public.consume_work_order_inventory_on_production() from public,anon;
grant execute on function public.consume_work_order_inventory_on_production() to authenticated;

drop trigger if exists trg_consume_work_order_inventory_on_production on public.work_orders;
create trigger trg_consume_work_order_inventory_on_production
after update of status on public.work_orders
for each row
when (new.status='PRODUCTION' and old.status is distinct from new.status)
execute function public.consume_work_order_inventory_on_production();

-- Recalcular reservas existentes vinculadas para consistencia inicial.
do $$
declare r record;begin
  for r in select id from public.inventory_items loop
    perform public.refresh_inventory_reserved_stock(r.id);
  end loop;
end $$;
