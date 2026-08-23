-- IDEALO SV · Inventario -> Compras / Proveedores
-- Reposición sugerida, preparación de compras y recepción trazable a Kardex.

alter table public.purchases
  add column if not exists procurement_status text not null default 'REGISTERED',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists prepared_at timestamptz,
  add column if not exists received_at timestamptz;

alter table public.purchases drop constraint if exists purchases_procurement_status_check;
alter table public.purchases
  add constraint purchases_procurement_status_check
  check (procurement_status in ('DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED','REGISTERED')) not valid;
alter table public.purchases validate constraint purchases_procurement_status_check;

alter table public.purchase_items
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists received_quantity numeric(12,3) not null default 0,
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create index if not exists purchases_procurement_company_status_idx
  on public.purchases(company_id,procurement_status,purchase_date desc);
create index if not exists purchases_procurement_source_idx
  on public.purchases(company_id,source_type,source_id)
  where source_id is not null;
create index if not exists purchase_items_inventory_order_idx
  on public.purchase_items(inventory_item_id,work_order_id)
  where inventory_item_id is not null;

create or replace view public.inventory_procurement_suggestions
with (security_invoker=true)
as
with production_shortage as (
  select pm.company_id,
         pm.inventory_item_id,
         max(pm.work_order_id) filter (where pm.work_order_id is not null) as work_order_id,
         sum(greatest(coalesce(pm.required_qty,0)-coalesce(pm.reserved_qty,0),0)) as production_shortage
  from public.production_material_requirements pm
  join public.work_orders wo on wo.id=pm.work_order_id
  where pm.inventory_item_id is not null
    and wo.status not in ('DELIVERED','CANCELLED')
  group by pm.company_id,pm.inventory_item_id
), open_purchase as (
  select pi.company_id,pi.inventory_item_id,
         sum(greatest(coalesce(pi.quantity,0)-coalesce(pi.received_quantity,0),0)) as open_purchase_qty
  from public.purchase_items pi
  join public.purchases p on p.id=pi.purchase_id
  where pi.inventory_item_id is not null
    and p.procurement_status in ('DRAFT','ORDERED','PARTIAL')
  group by pi.company_id,pi.inventory_item_id
)
select i.company_id,
       i.id as inventory_item_id,
       i.sku,
       i.name,
       i.unit,
       i.supplier_id,
       s.name as supplier_name,
       ps.work_order_id,
       coalesce(i.current_stock,0) as current_stock,
       coalesce(i.reserved_stock,0) as reserved_stock,
       greatest(coalesce(i.current_stock,0)-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0) as available_stock,
       greatest(coalesce(i.target_stock,0),coalesce(i.maximum_stock,0),coalesce(i.minimum_stock,0),coalesce(i.reorder_point,0)) as target_stock,
       coalesce(ps.production_shortage,0) as production_shortage,
       coalesce(op.open_purchase_qty,0) as open_purchase_qty,
       greatest(
         greatest(coalesce(i.target_stock,0),coalesce(i.maximum_stock,0),coalesce(i.minimum_stock,0),coalesce(i.reorder_point,0))
           - (coalesce(i.current_stock,0)+coalesce(i.in_transit_stock,0)-coalesce(i.reserved_stock,0)-coalesce(i.committed_stock,0)),
         coalesce(ps.production_shortage,0),
         0
       ) - coalesce(op.open_purchase_qty,0) as suggested_qty,
       coalesce(nullif(i.replacement_cost,0),nullif(i.last_cost,0),nullif(i.average_cost,0),nullif(i.standard_cost,0),0) as estimated_unit_cost,
       case
         when coalesce(ps.production_shortage,0)>0 then 'FALTANTE_OT'
         when coalesce(i.current_stock,0)<=0 then 'AGOTADO'
         when coalesce(i.current_stock,0)<=greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0)) then 'STOCK_BAJO'
         else 'REPOSICION'
       end as reason
from public.inventory_items i
left join public.suppliers s on s.id=i.supplier_id and s.company_id=i.company_id
left join production_shortage ps on ps.company_id=i.company_id and ps.inventory_item_id=i.id
left join open_purchase op on op.company_id=i.company_id and op.inventory_item_id=i.id
where i.active=true and i.deleted_at is null
  and greatest(
        greatest(coalesce(i.target_stock,0),coalesce(i.maximum_stock,0),coalesce(i.minimum_stock,0),coalesce(i.reorder_point,0))
          - (coalesce(i.current_stock,0)+coalesce(i.in_transit_stock,0)-coalesce(i.reserved_stock,0)-coalesce(i.committed_stock,0)),
        coalesce(ps.production_shortage,0),0
      ) - coalesce(op.open_purchase_qty,0) > 0;

grant select on public.inventory_procurement_suggestions to authenticated;

create or replace function public.prepare_inventory_purchase(
  p_inventory_item uuid,
  p_work_order uuid default null
) returns uuid
language plpgsql
security invoker
set search_path='public'
as $$
declare
  v_item public.inventory_items%rowtype;
  v_suggest record;
  v_purchase uuid;
  v_cost numeric(14,4);
  v_qty numeric(12,3);
  v_total numeric(12,2);
begin
  select * into v_item
  from public.inventory_items
  where id=p_inventory_item and active=true and deleted_at is null;
  if not found then raise exception 'Artículo de inventario no disponible'; end if;
  if not public.is_company_member(v_item.company_id) then raise exception 'Sin acceso a esta empresa'; end if;

  select * into v_suggest
  from public.inventory_procurement_suggestions
  where company_id=v_item.company_id and inventory_item_id=v_item.id;
  if not found then raise exception 'Este artículo no necesita reposición actualmente'; end if;

  v_qty:=greatest(coalesce(v_suggest.suggested_qty,0),0);
  if v_qty<=0 then raise exception 'No hay cantidad pendiente de compra'; end if;
  v_cost:=coalesce(v_suggest.estimated_unit_cost,0);
  v_total:=round((v_qty*v_cost)::numeric,2);

  select p.id into v_purchase
  from public.purchases p
  join public.purchase_items pi on pi.purchase_id=p.id and pi.inventory_item_id=v_item.id
  where p.company_id=v_item.company_id
    and p.procurement_status='DRAFT'
    and p.source_type='INVENTORY_REPLENISHMENT'
  order by p.created_at desc
  limit 1;
  if v_purchase is not null then return v_purchase; end if;

  insert into public.purchases(
    company_id,supplier_id,purchase_date,document_type,concept,subtotal,tax,total,
    payment_status,notes,procurement_status,source_type,source_id,prepared_at
  ) values (
    v_item.company_id,v_item.supplier_id,current_date,'OTHER',
    'Reposición sugerida: '||v_item.name,v_total,0,v_total,'PENDING',
    case when p_work_order is not null then 'Preparada por faltante de material para OT '||p_work_order::text else 'Preparada automáticamente desde Inventario 360' end,
    'DRAFT','INVENTORY_REPLENISHMENT',v_item.id,now()
  ) returning id into v_purchase;

  insert into public.purchase_items(
    company_id,purchase_id,inventory_item_id,work_order_id,description,category,
    quantity,unit_cost,internal_use,source_type,source_id
  ) values (
    v_item.company_id,v_purchase,v_item.id,coalesce(p_work_order,v_suggest.work_order_id),
    v_item.name,'MATERIAL',v_qty,v_cost,true,'INVENTORY_REPLENISHMENT',v_item.id
  );

  return v_purchase;
end;
$$;

revoke all on function public.prepare_inventory_purchase(uuid,uuid) from public,anon;
grant execute on function public.prepare_inventory_purchase(uuid,uuid) to authenticated;

create or replace function public.receive_inventory_purchase(p_purchase uuid)
returns integer
language plpgsql
security invoker
set search_path='public'
as $$
declare
  p public.purchases%rowtype;
  r record;
  v_qty numeric(12,3);
  v_count integer:=0;
begin
  select * into p from public.purchases where id=p_purchase for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if not public.is_company_member(p.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if p.procurement_status='RECEIVED' then return 0; end if;
  if p.procurement_status='CANCELLED' then raise exception 'No se puede recibir una compra cancelada'; end if;

  for r in
    select pi.*,i.warehouse_id,i.location_id,i.average_cost
    from public.purchase_items pi
    join public.inventory_items i on i.id=pi.inventory_item_id and i.company_id=pi.company_id
    where pi.purchase_id=p.id and pi.inventory_item_id is not null
    order by pi.created_at,pi.id
  loop
    v_qty:=greatest(coalesce(r.quantity,0)-coalesce(r.received_quantity,0),0);
    if v_qty>0 then
      insert into public.inventory_movements(
        company_id,inventory_item_id,movement_type,quantity,unit_cost,purchase_id,
        warehouse_id,location_id,document_type,document_id,reference,notes,created_by
      ) values (
        p.company_id,r.inventory_item_id,'PURCHASE_IN',v_qty,coalesce(r.unit_cost,r.average_cost,0),p.id,
        r.warehouse_id,r.location_id,'PURCHASE',p.id,
        'COM-'||coalesce(p.number::text,p.id::text),'Recepción automática desde Compras',auth.uid()
      );
      update public.purchase_items set received_quantity=quantity where id=r.id;
      v_count:=v_count+1;
    end if;
  end loop;

  update public.purchases
  set procurement_status='RECEIVED',received_at=now(),updated_at=now()
  where id=p.id;
  return v_count;
end;
$$;

revoke all on function public.receive_inventory_purchase(uuid) from public,anon;
grant execute on function public.receive_inventory_purchase(uuid) to authenticated;
