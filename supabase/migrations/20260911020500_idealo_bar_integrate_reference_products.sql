create or replace function public.bar_integrate_reference_products(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_demo boolean;
  v_product record;
  v_inventory_id uuid;
  v_inventory_sku text;
  v_sale_price numeric;
  v_bodega numeric;
  v_refrigerador numeric;
  v_barra numeric;
  v_emoji text;
  v_count int:=0;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select demo_mode into v_demo from public.companies where id=p_company_id;
  if not found or coalesce(v_demo,false)=false then raise exception 'Solo disponible en MODO PRÁCTICA.'; end if;
  if not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede integrar el catálogo de práctica.';
  end if;

  for v_product in
    select * from public.finished_products
    where company_id=p_company_id and active=true and coalesce(tags,'{}'::text[]) @> array['super-selectos']::text[]
    order by category,name
  loop
    v_sale_price:=case
      when coalesce(v_product.cost_estimate,0)>0 and v_product.category in ('Cervezas','Smirnoff / RTD','Hard Seltzer') then round(greatest(v_product.cost_estimate*1.60,v_product.cost_estimate+0.75)::numeric,2)
      when coalesce(v_product.cost_estimate,0)>0 and v_product.category in ('Vinos','Espumantes','Sangrías') then round((v_product.cost_estimate*1.80)::numeric,2)
      when coalesce(v_product.cost_estimate,0)>0 then round((v_product.cost_estimate*2.00)::numeric,2)
      when v_product.category='Cervezas' then 2.00
      when v_product.category in ('Smirnoff / RTD','Hard Seltzer') then 3.00
      when v_product.category='Vodka' then 20.00
      when v_product.category='Whisky' then 30.00
      when v_product.category='Ron' then 20.00
      when v_product.category='Tequila / Mezcal' then 25.00
      when v_product.category='Gin y Licores' then 20.00
      when v_product.category='Aguardiente' then 10.00
      when v_product.category='Vinos' then 15.00
      when v_product.category='Espumantes' then 20.00
      when v_product.category='Sangrías' then 10.00
      else 5.00 end;

    v_inventory_sku:='INV-'||v_product.sku;
    select id into v_inventory_id from public.inventory_items
    where company_id=p_company_id and sku=v_inventory_sku and deleted_at is null
    order by created_at limit 1;

    if v_inventory_id is null then
      insert into public.inventory_items(company_id,sku,name,category,subcategory,item_type,unit,current_stock,average_cost,last_cost,standard_cost,minimum_stock,reorder_point,target_stock,active,notes)
      values(p_company_id,v_inventory_sku,v_product.name,'OTHER','BAR','MATERIAL','UNIT',0,coalesce(v_product.cost_estimate,0),coalesce(v_product.cost_estimate,0),coalesce(v_product.cost_estimate,0),0,0,0,true,
             'IDEALO BAR · producto integrado. Fuente interna de referencia de compra: Súper Selectos. Precio/costo de entrenamiento.')
      returning id into v_inventory_id;
    else
      update public.inventory_items
      set name=v_product.name,category='OTHER',subcategory='BAR',item_type='MATERIAL',unit='UNIT',active=true,
          average_cost=coalesce(v_product.cost_estimate,average_cost),last_cost=coalesce(v_product.cost_estimate,last_cost),
          notes='IDEALO BAR · producto integrado. Fuente interna de referencia de compra: Súper Selectos. Precio/costo de entrenamiento.',updated_at=now()
      where id=v_inventory_id;
    end if;

    if v_product.category in ('Cervezas','Smirnoff / RTD','Hard Seltzer') then
      v_bodega:=12;v_refrigerador:=6;v_barra:=6;
    elsif v_product.category in ('Vinos','Espumantes','Sangrías') then
      v_bodega:=6;v_refrigerador:=2;v_barra:=2;
    else
      v_bodega:=4;v_refrigerador:=0;v_barra:=2;
    end if;

    perform public.bar_save_physical_inventory(v_inventory_id,v_bodega,v_refrigerador,v_barra,coalesce(v_product.cost_estimate,0),greatest(2,round((v_bodega+v_refrigerador+v_barra)/4)),greatest(3,round((v_bodega+v_refrigerador+v_barra)/2)),v_bodega+v_refrigerador+v_barra);

    insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by)
    values(p_company_id,v_product.id,v_inventory_id,1,0,true,'Venta directa · descuenta 1 unidad del inventario integrado.',auth.uid())
    on conflict(company_id,product_id,inventory_item_id)
    do update set quantity_per_unit=1,waste_percent=0,active=true,notes=excluded.notes,updated_at=now();

    v_emoji:=case
      when v_product.category='Cervezas' then '🍺'
      when v_product.category in ('Vinos','Sangrías') then '🍷'
      when v_product.category='Espumantes' then '🥂'
      when v_product.category in ('Smirnoff / RTD','Hard Seltzer') then '🍹'
      else '🥃' end;

    update public.finished_products
    set sale_price=v_sale_price,subcategory='BAR',requires_production=false,affects_inventory=false,
        internal_notes=concat_ws(' · ',nullif(internal_notes,''),'PRECIO DE ENTRENAMIENTO IDEALO BAR'),updated_at=now()
    where id=v_product.id;

    insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,emoji,active,sort_order)
    values(p_company_id,v_product.id,v_product.name,v_product.category,'bar',v_sale_price,v_emoji,true,50)
    on conflict(company_id,product_id)
    do update set display_name=excluded.display_name,category=excluded.category,station='bar',sale_price_override=excluded.sale_price_override,emoji=excluded.emoji,active=true,updated_at=now();

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('integrated',v_count,'message','Productos integrados en Carta e Inventario como datos normales de IDEALO BAR.');
end;
$$;

revoke all on function public.bar_integrate_reference_products(uuid) from public, anon;
grant execute on function public.bar_integrate_reference_products(uuid) to authenticated;

create or replace function public.bar_restore_integrated_catalog_after_seed()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.demo_mode=true and new.demo_seeded_at is distinct from old.demo_seeded_at then
    perform public.bar_integrate_reference_products(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bar_restore_integrated_catalog_after_seed on public.companies;
create trigger trg_bar_restore_integrated_catalog_after_seed
after update of demo_seeded_at on public.companies
for each row
when (new.demo_mode=true)
execute function public.bar_restore_integrated_catalog_after_seed();