-- Sincroniza consumo de recetas con Bodega/Refrigerador/Barra y permite compras manuales por presentación.
create table if not exists public.bar_location_consumption_allocations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 consumption_id uuid not null references public.bar_inventory_consumptions(id) on delete cascade,
 stock_id uuid not null references public.bar_inventory_location_stock(id) on delete restrict,
 quantity numeric(18,6) not null check(quantity>0), created_at timestamptz not null default now()
);
create index if not exists bar_location_consumption_consumption_idx on public.bar_location_consumption_allocations(consumption_id);
create index if not exists bar_location_consumption_stock_idx on public.bar_location_consumption_allocations(stock_id);
alter table public.bar_location_consumption_allocations enable row level security;
create policy bar_location_consumption_read on public.bar_location_consumption_allocations for select to authenticated using(public.erp_can_operate(company_id));
grant select on public.bar_location_consumption_allocations to authenticated;

create or replace function public.bar_apply_location_consumption()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_remaining numeric(18,6):=new.quantity; v_row public.bar_inventory_location_stock%rowtype; v_take numeric(18,6); v_configured boolean;
begin
 select exists(select 1 from public.bar_inventory_location_stock where company_id=new.company_id and inventory_item_id=new.inventory_item_id) into v_configured;
 if not v_configured then return new; end if;
 for v_row in select * from public.bar_inventory_location_stock where company_id=new.company_id and inventory_item_id=new.inventory_item_id and quantity>0 order by case location_kind when 'BAR' then 1 when 'FRIDGE' then 2 when 'WAREHOUSE' then 3 else 4 end,updated_at,id for update loop
   exit when v_remaining<=0; v_take:=least(v_remaining,v_row.quantity);
   update public.bar_inventory_location_stock set quantity=quantity-v_take,updated_at=now() where id=v_row.id;
   insert into public.bar_location_consumption_allocations(company_id,consumption_id,stock_id,quantity) values(new.company_id,new.id,v_row.id,v_take);
   v_remaining:=v_remaining-v_take;
 end loop;
 if v_remaining>0 then raise exception 'Existencia insuficiente en ubicaciones BAR/REFRIGERADOR/BODEGA para %: faltan % unidades.',new.inventory_item_id,v_remaining; end if;
 return new;
end;$$;
drop trigger if exists bar_location_consumption_after_insert on public.bar_inventory_consumptions;
create trigger bar_location_consumption_after_insert after insert on public.bar_inventory_consumptions for each row execute function public.bar_apply_location_consumption();

create or replace function public.bar_restore_location_consumption()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if old.reversed_at is null and new.reversed_at is not null then
   for r in select * from public.bar_location_consumption_allocations where consumption_id=new.id loop
     update public.bar_inventory_location_stock set quantity=quantity+r.quantity,updated_at=now() where id=r.stock_id;
   end loop;
 end if; return new;
end;$$;
drop trigger if exists bar_location_consumption_restore on public.bar_inventory_consumptions;
create trigger bar_location_consumption_restore after update of reversed_at on public.bar_inventory_consumptions for each row execute function public.bar_restore_location_consumption();
revoke execute on function public.bar_apply_location_consumption() from public,anon,authenticated;
revoke execute on function public.bar_restore_location_consumption() from public,anon,authenticated;

create or replace function public.bar_prepare_purchase_by_presentation(p_presentation_id uuid,p_presentations numeric)
returns uuid language plpgsql set search_path=public as $$
declare v_pres public.bar_inventory_presentations%rowtype; v_item public.inventory_items%rowtype; v_supplier uuid; v_base_qty numeric; v_unit_cost numeric; v_total numeric; v_purchase uuid;
begin
 select * into v_pres from public.bar_inventory_presentations where id=p_presentation_id and active=true; if not found then raise exception 'Presentación no encontrada.'; end if;
 select * into v_item from public.inventory_items where id=v_pres.inventory_item_id and company_id=v_pres.company_id and active=true and deleted_at is null; if not found then raise exception 'Insumo no disponible.'; end if;
 if not public.bar_has_permission(v_pres.company_id,'inventory.manage') and not public.erp_can_admin(v_pres.company_id) then raise exception 'Tu rol no puede preparar compras.'; end if;
 if p_presentations<=0 then raise exception 'Cantidad inválida.'; end if;
 v_supplier:=coalesce(v_pres.preferred_supplier_id,v_item.supplier_id); if v_supplier is null then raise exception 'Asigná un proveedor a la presentación o al insumo.'; end if;
 v_base_qty:=round(p_presentations*v_pres.units_per_presentation,3);
 v_unit_cost:=case when coalesce(v_pres.purchase_cost,0)>0 then round(v_pres.purchase_cost/v_pres.units_per_presentation,4) else coalesce(nullif(v_item.last_cost,0),nullif(v_item.average_cost,0),0) end;
 v_total:=round(v_base_qty*v_unit_cost,2);
 insert into public.purchases(company_id,supplier_id,purchase_date,document_type,concept,subtotal,tax,total,payment_status,notes,procurement_status,source_type,source_id,prepared_at)
 values(v_pres.company_id,v_supplier,current_date,'OTHER','IDEALO BAR · '||v_item.name||' · '||p_presentations||' x '||v_pres.name,v_total,0,v_total,'PENDING','Compra preparada desde presentación del bar. Confirmar documento, impuestos y costo antes de recibir.','DRAFT','BAR_PRESENTATION',v_pres.id,now()) returning id into v_purchase;
 insert into public.purchase_items(company_id,purchase_id,inventory_item_id,description,category,quantity,unit_cost,internal_use,source_type,source_id)
 values(v_pres.company_id,v_purchase,v_item.id,v_item.name||' · '||v_pres.name,'MATERIAL',v_base_qty,v_unit_cost,true,'BAR_PRESENTATION',v_pres.id);
 return v_purchase;
end;$$;