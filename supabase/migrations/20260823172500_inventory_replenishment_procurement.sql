-- IDEALO SV · Inventario -> Compras/Proveedores
-- Detección automática de reposición y creación de compra preparada.

alter table public.purchases
  add column if not exists procurement_status text not null default 'DRAFT',
  add column if not exists source_type text,
  add column if not exists source_id uuid;

alter table public.purchases drop constraint if exists purchases_procurement_status_check;
alter table public.purchases
  add constraint purchases_procurement_status_check
  check (procurement_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED','CANCELLED')) not valid;
alter table public.purchases validate constraint purchases_procurement_status_check;

create unique index if not exists purchases_open_replenishment_unique
  on public.purchases(company_id,source_type,source_id)
  where source_type='INVENTORY_REORDER' and procurement_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED');

create or replace view public.inventory_replenishment_needs
with (security_invoker=true)
as
with production_need as (
  select pm.company_id,pm.inventory_item_id,
         sum(greatest(coalesce(pm.required_qty,0)-coalesce(pm.reserved_qty,0),0)) as production_shortage
  from public.production_material_requirements pm
  join public.work_orders wo on wo.id=pm.work_order_id
  where pm.inventory_item_id is not null
    and wo.status not in ('DELIVERED','CANCELLED')
  group by pm.company_id,pm.inventory_item_id
), base as (
  select i.id as inventory_item_id,i.company_id,i.sku,i.name,i.unit,i.current_stock,i.reserved_stock,
         greatest(coalesce(i.current_stock,0)-coalesce(i.reserved_stock,0),0) as available_stock,
         i.minimum_stock,i.reorder_point,i.target_stock,i.maximum_stock,
         i.average_cost,i.last_cost,i.replacement_cost,i.supplier_id,s.name as supplier_name,
         coalesce(pn.production_shortage,0) as production_shortage
  from public.inventory_items i
  left join public.suppliers s on s.id=i.supplier_id and s.company_id=i.company_id
  left join production_need pn on pn.company_id=i.company_id and pn.inventory_item_id=i.id
  where i.active=true and i.deleted_at is null
)
select b.*,
       greatest(
         coalesce(b.production_shortage,0),
         greatest(coalesce(b.minimum_stock,0),coalesce(b.reorder_point,0))-b.available_stock,
         coalesce(nullif(b.target_stock,0),nullif(b.maximum_stock,0),greatest(b.minimum_stock,b.reorder_point))-b.available_stock,
         0
       )::numeric(18,3) as suggested_qty,
       coalesce(nullif(b.replacement_cost,0),nullif(b.last_cost,0),b.average_cost,0)::numeric(18,4) as estimated_unit_cost
from base b
where b.production_shortage>0
   or b.available_stock<=greatest(coalesce(b.minimum_stock,0),coalesce(b.reorder_point,0));

grant select on public.inventory_replenishment_needs to authenticated;

create or replace function public.create_replenishment_purchase(p_inventory_item uuid,p_quantity numeric default null)
returns uuid
language plpgsql
security invoker
set search_path='public'
as $$
declare
  n public.inventory_replenishment_needs%rowtype;
  v_qty numeric(18,3);
  v_cost numeric(18,4);
  v_total numeric(12,2);
  v_purchase uuid;
begin
  select * into n from public.inventory_replenishment_needs where inventory_item_id=p_inventory_item;
  if not found then raise exception 'El artículo no requiere reposición actualmente'; end if;
  if not public.is_company_member(n.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if n.supplier_id is null then raise exception 'Asigná un proveedor principal al artículo antes de preparar la compra'; end if;

  select p.id into v_purchase
  from public.purchases p
  where p.company_id=n.company_id and p.source_type='INVENTORY_REORDER' and p.source_id=n.inventory_item_id
    and p.procurement_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED')
  order by p.created_at desc limit 1;
  if v_purchase is not null then return v_purchase; end if;

  v_qty:=greatest(coalesce(p_quantity,n.suggested_qty),0);
  if v_qty<=0 then raise exception 'La cantidad de reposición debe ser mayor a cero'; end if;
  v_cost:=coalesce(n.estimated_unit_cost,0);
  v_total:=round((v_qty*v_cost)::numeric,2);

  insert into public.purchases(
    company_id,supplier_id,purchase_date,document_type,concept,subtotal,tax,total,payment_status,notes,
    procurement_status,source_type,source_id
  ) values (
    n.company_id,n.supplier_id,current_date,'OTHER','Reposición sugerida · '||n.name,v_total,0,v_total,'PENDING',
    'Generada desde Inventario. Confirmar precio, documento e impuestos antes de ordenar.',
    'DRAFT','INVENTORY_REORDER',n.inventory_item_id
  ) returning id into v_purchase;

  insert into public.purchase_items(company_id,purchase_id,inventory_item_id,description,category,quantity,unit_cost,internal_use)
  values(n.company_id,v_purchase,n.inventory_item_id,n.name,'MATERIAL',v_qty,v_cost,true);

  return v_purchase;
end;
$$;

revoke all on function public.create_replenishment_purchase(uuid,numeric) from public,anon;
grant execute on function public.create_replenishment_purchase(uuid,numeric) to authenticated;
