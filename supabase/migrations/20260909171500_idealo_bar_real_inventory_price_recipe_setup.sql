create or replace function public.bar_save_physical_inventory(
  p_inventory_item_id uuid,
  p_bodega numeric,
  p_refrigerador numeric,
  p_barra numeric,
  p_unit_cost numeric,
  p_minimum_stock numeric default 0,
  p_reorder_point numeric default 0,
  p_target_stock numeric default 0
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_wh uuid; v_bodega uuid; v_refrig uuid; v_barra uuid;
  v_old numeric; v_new numeric; v_delta numeric;
begin
  select * into v_item from public.inventory_items where id=p_inventory_item_id and active=true and deleted_at is null for update;
  if not found then raise exception 'Insumo no encontrado.'; end if;
  if not public.bar_has_permission(v_item.company_id,'inventory.manage') and not public.erp_can_admin(v_item.company_id) then raise exception 'Tu rol no puede registrar el conteo físico.'; end if;
  if least(coalesce(p_bodega,-1),coalesce(p_refrigerador,-1),coalesce(p_barra,-1),coalesce(p_unit_cost,-1),coalesce(p_minimum_stock,-1),coalesce(p_reorder_point,-1),coalesce(p_target_stock,-1))<0 then raise exception 'Cantidades, costos y mínimos no pueden ser negativos.'; end if;
  select id into v_wh from public.inventory_warehouses where company_id=v_item.company_id and code='BAR-BOD' and active=true limit 1;
  if v_wh is null then raise exception 'No existe la Bodega del bar.'; end if;
  select id into v_bodega from public.inventory_locations where company_id=v_item.company_id and warehouse_id=v_wh and code='BODEGA' and active=true limit 1;
  select id into v_refrig from public.inventory_locations where company_id=v_item.company_id and warehouse_id=v_wh and code='REFRIG' and active=true limit 1;
  select id into v_barra from public.inventory_locations where company_id=v_item.company_id and warehouse_id=v_wh and code='BARRA' and active=true limit 1;
  if v_bodega is null or v_refrig is null or v_barra is null then raise exception 'Faltan ubicaciones Bodega, Refrigerador o Barra.'; end if;
  v_old:=coalesce(v_item.current_stock,0); v_new:=round(coalesce(p_bodega,0)+coalesce(p_refrigerador,0)+coalesce(p_barra,0),3); v_delta:=round(v_new-v_old,3);
  if v_delta>0 then
    insert into public.inventory_movements(company_id,inventory_item_id,warehouse_id,movement_type,quantity,unit_cost,document_type,document_id,reference,notes,created_by)
    values(v_item.company_id,v_item.id,v_wh,'ADJUST_IN',v_delta,coalesce(p_unit_cost,0),'BAR_PHYSICAL_COUNT',v_item.id,'IDEALO BAR','Ajuste por conteo físico inicial/actualizado.',auth.uid());
  elsif v_delta<0 then
    insert into public.inventory_movements(company_id,inventory_item_id,warehouse_id,movement_type,quantity,unit_cost,document_type,document_id,reference,notes,created_by)
    values(v_item.company_id,v_item.id,v_wh,'ADJUST_OUT',abs(v_delta),coalesce(p_unit_cost,0),'BAR_PHYSICAL_COUNT',v_item.id,'IDEALO BAR','Ajuste por conteo físico inicial/actualizado.',auth.uid());
  end if;
  insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity,updated_by)
  values (v_item.company_id,v_item.id,v_wh,v_bodega,'WAREHOUSE',round(p_bodega,3),auth.uid()),(v_item.company_id,v_item.id,v_wh,v_refrig,'FRIDGE',round(p_refrigerador,3),auth.uid()),(v_item.company_id,v_item.id,v_wh,v_barra,'BAR',round(p_barra,3),auth.uid())
  on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do update set quantity=excluded.quantity,updated_by=auth.uid(),updated_at=now();
  update public.inventory_items set average_cost=round(p_unit_cost,4),last_cost=round(p_unit_cost,4),standard_cost=round(p_unit_cost,4),minimum_stock=round(p_minimum_stock,3),reorder_point=round(p_reorder_point,3),target_stock=round(p_target_stock,3),warehouse_id=coalesce(warehouse_id,v_wh),notes=case when v_new>0 or p_unit_cost>0 then 'IDEALO BAR · conteo físico registrado' else notes end,updated_at=now() where id=v_item.id;
  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id)
  values(v_item.company_id,'INVENTORY','PHYSICAL_COUNT','inventory_item',v_item.id::text,jsonb_build_object('old_total',v_old,'new_total',v_new,'bodega',p_bodega,'refrigerador',p_refrigerador,'barra',p_barra,'unit_cost',p_unit_cost,'minimum_stock',p_minimum_stock,'reorder_point',p_reorder_point,'target_stock',p_target_stock),auth.uid());
  return jsonb_build_object('inventory_item_id',v_item.id,'old_total',v_old,'new_total',v_new,'delta',v_delta,'unit_cost',round(p_unit_cost,4));
end;
$$;

grant execute on function public.bar_save_physical_inventory(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.bar_save_product_price(p_product_id uuid,p_price numeric,p_activate boolean default false)
returns jsonb
language plpgsql
set search_path=public
as $$
declare v_product public.finished_products%rowtype; v_recipe_count int; v_menu_id uuid;
begin
  select * into v_product from public.finished_products where id=p_product_id for update; if not found then raise exception 'Producto no encontrado.'; end if;
  if not public.bar_has_permission(v_product.company_id,'catalog.manage') and not public.erp_can_admin(v_product.company_id) then raise exception 'Tu rol no puede cambiar precios de la carta.'; end if;
  if p_price is null or p_price<0 then raise exception 'Precio inválido.'; end if;
  select count(*) into v_recipe_count from public.bar_recipe_components where company_id=v_product.company_id and product_id=v_product.id and active=true;
  if coalesce(p_activate,false) and p_price<=0 then raise exception 'No se puede activar un producto con precio cero.'; end if;
  if coalesce(p_activate,false) and v_recipe_count=0 then raise exception 'No se puede activar un producto sin receta activa.'; end if;
  update public.finished_products set sale_price=round(p_price,2),active=case when p_activate then true else active end,description=case when p_activate then 'Producto activo de IDEALO BAR.' else description end,internal_notes=case when p_activate then null else internal_notes end,updated_at=now() where id=v_product.id;
  update public.bar_menu_items set sale_price_override=case when p_price>0 then round(p_price,2) else null end,active=case when p_activate then true else active end,updated_at=now() where company_id=v_product.company_id and product_id=v_product.id returning id into v_menu_id;
  if v_menu_id is null then raise exception 'El producto no está vinculado a la Carta del bar.'; end if;
  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id)
  values(v_product.company_id,'CATALOG',case when p_activate then 'PRODUCT_ACTIVATED' else 'PRICE_UPDATED' end,'finished_product',v_product.id::text,jsonb_build_object('price',round(p_price,2),'recipe_components',v_recipe_count),auth.uid());
  return jsonb_build_object('product_id',v_product.id,'price',round(p_price,2),'active',coalesce(p_activate,false) or v_product.active,'recipe_components',v_recipe_count);
end;
$$;

grant execute on function public.bar_save_product_price(uuid,numeric,boolean) to authenticated;

create or replace function public.bar_replace_product_recipe(p_product_id uuid,p_components jsonb)
returns jsonb
language plpgsql
set search_path=public
as $$
declare v_product public.finished_products%rowtype; v_component jsonb; v_inventory uuid; v_qty numeric; v_waste numeric; v_count int:=0;
begin
  select * into v_product from public.finished_products where id=p_product_id for update; if not found then raise exception 'Producto no encontrado.'; end if;
  if not public.bar_has_permission(v_product.company_id,'inventory.manage') and not public.erp_can_admin(v_product.company_id) then raise exception 'Tu rol no puede modificar recetas.'; end if;
  if p_components is null or jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'La receta debe contener al menos un insumo.'; end if;
  update public.bar_recipe_components set active=false,updated_at=now() where company_id=v_product.company_id and product_id=v_product.id and active=true;
  for v_component in select value from jsonb_array_elements(p_components) loop
    v_inventory:=(v_component->>'inventory_item_id')::uuid; v_qty:=coalesce((v_component->>'quantity')::numeric,0); v_waste:=coalesce((v_component->>'waste_percent')::numeric,0);
    if v_qty<=0 then raise exception 'Cada componente debe tener cantidad mayor que cero.'; end if;
    if v_waste<0 or v_waste>100 then raise exception 'La merma debe estar entre 0 y 100 por ciento.'; end if;
    if not exists(select 1 from public.inventory_items i where i.id=v_inventory and i.company_id=v_product.company_id and i.active=true and i.deleted_at is null) then raise exception 'Uno de los insumos no pertenece al bar/empresa.'; end if;
    insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by)
    values(v_product.company_id,v_product.id,v_inventory,v_qty,v_waste,true,'Receta real registrada desde Inventario y recetas.',auth.uid())
    on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,waste_percent=excluded.waste_percent,active=true,notes=excluded.notes,updated_at=now();
    v_count:=v_count+1;
  end loop;
  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id)
  values(v_product.company_id,'INVENTORY','RECIPE_REPLACED','finished_product',v_product.id::text,jsonb_build_object('components',v_count),auth.uid());
  return jsonb_build_object('product_id',v_product.id,'components',v_count);
end;
$$;

grant execute on function public.bar_replace_product_recipe(uuid,jsonb) to authenticated;

create or replace function public.bar_create_inventory_ingredient(p_company_id uuid,p_name text,p_unit text default 'UNIT')
returns uuid
language plpgsql
set search_path=public
as $$
declare v_id uuid; v_wh uuid; v_loc record; v_name text:=nullif(trim(coalesce(p_name,'')),''); v_unit text:=upper(nullif(trim(coalesce(p_unit,'')),'UNIT'));
begin
  if v_name is null then raise exception 'Escribe el nombre del insumo.'; end if;
  if not public.bar_has_permission(p_company_id,'inventory.manage') and not public.erp_can_admin(p_company_id) then raise exception 'Tu rol no puede crear insumos del bar.'; end if;
  if exists(select 1 from public.inventory_items where company_id=p_company_id and active=true and deleted_at is null and lower(trim(name))=lower(v_name)) then raise exception 'Ya existe un insumo activo con ese nombre.'; end if;
  select id into v_wh from public.inventory_warehouses where company_id=p_company_id and code='BAR-BOD' and active=true limit 1; if v_wh is null then raise exception 'No existe la Bodega del bar.'; end if;
  insert into public.inventory_items(company_id,name,category,subcategory,item_type,unit,current_stock,average_cost,last_cost,standard_cost,minimum_stock,reorder_point,target_stock,active,warehouse_id,notes)
  values(p_company_id,v_name,'OTHER','BAR','MATERIAL',v_unit,0,0,0,0,0,0,0,true,v_wh,'IDEALO BAR · insumo pendiente de conteo físico') returning id into v_id;
  for v_loc in select id,code from public.inventory_locations where company_id=p_company_id and warehouse_id=v_wh and code in ('BODEGA','REFRIG','BARRA') and active=true loop
    insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity,updated_by)
    values(p_company_id,v_id,v_wh,v_loc.id,case v_loc.code when 'BODEGA' then 'WAREHOUSE' when 'REFRIG' then 'FRIDGE' else 'BAR' end,0,auth.uid()) on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do nothing;
  end loop;
  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id) values(p_company_id,'INVENTORY','INGREDIENT_CREATED','inventory_item',v_id::text,jsonb_build_object('name',v_name,'unit',v_unit),auth.uid());
  return v_id;
end;
$$;

grant execute on function public.bar_create_inventory_ingredient(uuid,text,text) to authenticated;

create or replace function public.bar_real_setup_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
set search_path=public
as $$
with loc as (
  select s.inventory_item_id,coalesce(sum(s.quantity) filter(where l.code='BODEGA'),0) bodega,coalesce(sum(s.quantity) filter(where l.code='REFRIG'),0) refrigerador,coalesce(sum(s.quantity) filter(where l.code='BARRA'),0) barra
  from public.bar_inventory_location_stock s join public.inventory_locations l on l.id=s.location_id where s.company_id=p_company_id group by s.inventory_item_id
), inv as (
  select i.id,i.sku,i.name,i.unit,i.current_stock,i.average_cost,i.minimum_stock,i.reorder_point,i.target_stock,coalesce(loc.bodega,0) bodega,coalesce(loc.refrigerador,0) refrigerador,coalesce(loc.barra,0) barra
  from public.inventory_items i left join loc on loc.inventory_item_id=i.id where i.company_id=p_company_id and i.active=true and i.deleted_at is null and (upper(coalesce(i.subcategory,''))='BAR' or upper(coalesce(i.notes,'')) like '%IDEALO BAR%')
), prod as (
  select p.id,p.sku,p.name,m.category,m.station,coalesce(m.sale_price_override,p.sale_price) sale_price,m.active,(select count(*) from public.bar_recipe_components r where r.company_id=p_company_id and r.product_id=p.id and r.active=true) recipe_components,coalesce((select sum(r.quantity_per_unit*(1+r.waste_percent/100)*i.average_cost) from public.bar_recipe_components r join public.inventory_items i on i.id=r.inventory_item_id where r.company_id=p_company_id and r.product_id=p.id and r.active=true),0) recipe_cost
  from public.bar_menu_items m join public.finished_products p on p.id=m.product_id where m.company_id=p_company_id
)
select jsonb_build_object('inventory',coalesce((select jsonb_agg(to_jsonb(inv) order by name) from inv),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(prod) order by active desc,name) from prod),'[]'::jsonb),'recipes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'product_id',r.product_id,'inventory_item_id',r.inventory_item_id,'quantity',r.quantity_per_unit,'waste_percent',r.waste_percent,'active',r.active) order by r.created_at) from public.bar_recipe_components r where r.company_id=p_company_id and r.active=true),'[]'::jsonb))
where public.erp_can_read(p_company_id) or public.bar_has_permission(p_company_id,'inventory.view') or public.bar_has_permission(p_company_id,'inventory.manage') or public.bar_has_permission(p_company_id,'admin.view');
$$;

grant execute on function public.bar_real_setup_snapshot(uuid) to authenticated;
