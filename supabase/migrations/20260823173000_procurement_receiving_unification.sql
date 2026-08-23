-- IDEALO SV · Unificación Reposición -> Compra -> Recepción -> Inventario
-- Mantiene compras manuales como REGISTERED y compras de reposición con ciclo operativo.

alter table public.purchases
  alter column procurement_status set default 'REGISTERED',
  add column if not exists prepared_at timestamptz,
  add column if not exists received_at timestamptz;

alter table public.purchases drop constraint if exists purchases_procurement_status_check;
alter table public.purchases
  add constraint purchases_procurement_status_check
  check (procurement_status in ('REGISTERED','DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED','CANCELLED')) not valid;
alter table public.purchases validate constraint purchases_procurement_status_check;

alter table public.purchase_items
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists received_quantity numeric(12,3) not null default 0,
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create index if not exists purchase_items_inventory_order_idx
  on public.purchase_items(inventory_item_id,work_order_id)
  where inventory_item_id is not null;

-- Reposición neta: descuenta compras ya abiertas para no seguir sugiriendo lo que ya se pidió.
-- Conserva el orden original de columnas de la vista y agrega trazabilidad al final.
create or replace view public.inventory_replenishment_needs
with (security_invoker=true)
as
with production_need as (
  select pm.company_id,pm.inventory_item_id,
         (array_agg(pm.work_order_id) filter (where pm.work_order_id is not null))[1] as work_order_id,
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
    and p.procurement_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED')
  group by pi.company_id,pi.inventory_item_id
), base as (
  select i.id as inventory_item_id,i.company_id,i.sku,i.name,i.unit,i.current_stock,i.reserved_stock,
         greatest(coalesce(i.current_stock,0)-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0) as available_stock,
         i.minimum_stock,i.reorder_point,i.target_stock,i.maximum_stock,
         i.average_cost,i.last_cost,i.replacement_cost,i.supplier_id,s.name as supplier_name,
         pn.work_order_id,coalesce(pn.production_shortage,0) as production_shortage,
         coalesce(op.open_purchase_qty,0) as open_purchase_qty
  from public.inventory_items i
  left join public.suppliers s on s.id=i.supplier_id and s.company_id=i.company_id
  left join production_need pn on pn.company_id=i.company_id and pn.inventory_item_id=i.id
  left join open_purchase op on op.company_id=i.company_id and op.inventory_item_id=i.id
  where i.active=true and i.deleted_at is null
), calculated as (
  select b.*,
         greatest(
           coalesce(b.production_shortage,0),
           greatest(coalesce(b.minimum_stock,0),coalesce(b.reorder_point,0))-b.available_stock,
           coalesce(nullif(b.target_stock,0),nullif(b.maximum_stock,0),greatest(b.minimum_stock,b.reorder_point))-b.available_stock,
           0
         ) as gross_need,
         coalesce(nullif(b.replacement_cost,0),nullif(b.last_cost,0),b.average_cost,0)::numeric(18,4) as estimated_unit_cost
  from base b
)
select c.inventory_item_id,c.company_id,c.sku,c.name,c.unit,c.current_stock,c.reserved_stock,c.available_stock,
       c.minimum_stock,c.reorder_point,c.target_stock,c.maximum_stock,c.average_cost,c.last_cost,c.replacement_cost,
       c.supplier_id,c.supplier_name,c.production_shortage,
       greatest(c.gross_need-c.open_purchase_qty,0)::numeric(18,3) as suggested_qty,
       c.estimated_unit_cost,
       c.work_order_id,c.open_purchase_qty
from calculated c
where greatest(c.gross_need-c.open_purchase_qty,0)>0;

grant select on public.inventory_replenishment_needs to authenticated;

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
  if p.procurement_status not in ('ORDERED','PARTIAL_RECEIVED') then
    raise exception 'Marcá la compra como ordenada antes de recibirla';
  end if;

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

  if v_count=0 then raise exception 'La compra no tiene partidas de inventario pendientes de recibir'; end if;

  update public.purchases
  set procurement_status='RECEIVED',received_at=now(),updated_at=now()
  where id=p.id;
  return v_count;
end;
$$;

revoke all on function public.receive_inventory_purchase(uuid) from public,anon;
grant execute on function public.receive_inventory_purchase(uuid) to authenticated;
