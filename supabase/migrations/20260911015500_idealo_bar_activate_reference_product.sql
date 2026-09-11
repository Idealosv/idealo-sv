create or replace function public.bar_activate_reference_product(
  p_product_id uuid,
  p_sale_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.finished_products%rowtype;
  v_demo boolean;
  v_inventory_id uuid;
  v_inventory_sku text;
  v_emoji text;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  if p_sale_price is null or p_sale_price<=0 then raise exception 'Ingresá un precio de venta mayor que cero.'; end if;

  select * into v_product from public.finished_products where id=p_product_id;
  if not found then raise exception 'Producto de referencia no encontrado.'; end if;
  if not (coalesce(v_product.tags,'{}'::text[]) @> array['super-selectos']::text[]) then
    raise exception 'El producto no pertenece al catálogo de referencia de Super Selectos.';
  end if;

  select demo_mode into v_demo from public.companies where id=v_product.company_id;
  if coalesce(v_demo,false)=false then raise exception 'Esta activación está habilitada solo en MODO PRÁCTICA.'; end if;
  if not public.erp_can_admin(v_product.company_id)
     and not public.bar_has_permission(v_product.company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede activar productos de referencia.';
  end if;

  v_inventory_sku:='INV-'||v_product.sku;
  select id into v_inventory_id
  from public.inventory_items
  where company_id=v_product.company_id and sku=v_inventory_sku and deleted_at is null
  order by created_at limit 1;

  if v_inventory_id is null then
    insert into public.inventory_items(
      company_id,sku,name,category,subcategory,item_type,unit,current_stock,
      average_cost,last_cost,standard_cost,minimum_stock,reorder_point,target_stock,active,notes
    ) values (
      v_product.company_id,v_inventory_sku,v_product.name,'OTHER','BAR','MATERIAL','UNIT',0,
      coalesce(v_product.cost_estimate,0),coalesce(v_product.cost_estimate,0),coalesce(v_product.cost_estimate,0),0,0,0,true,
      'IDEALO BAR · referencia Super Selectos. Costo inicial es referencia de supermercado y debe confirmarse al comprar.'
    ) returning id into v_inventory_id;
  else
    update public.inventory_items
    set name=v_product.name,subcategory='BAR',item_type='MATERIAL',unit='UNIT',active=true,
        notes='IDEALO BAR · referencia Super Selectos. Costo inicial es referencia de supermercado y debe confirmarse al comprar.',updated_at=now()
    where id=v_inventory_id;
  end if;

  insert into public.bar_recipe_components(
    company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by
  ) values (
    v_product.company_id,v_product.id,v_inventory_id,1,0,true,'Venta directa · descuenta 1 unidad del producto de referencia.',auth.uid()
  )
  on conflict(company_id,product_id,inventory_item_id)
  do update set quantity_per_unit=1,waste_percent=0,active=true,notes=excluded.notes,updated_at=now();

  v_emoji:=case
    when v_product.category='Cervezas' then '🍺'
    when v_product.category in ('Vinos','Sangrías') then '🍷'
    when v_product.category='Espumantes' then '🥂'
    when v_product.category in ('Vodka','Ron','Whisky','Tequila / Mezcal','Gin y Licores','Aguardiente') then '🥃'
    when v_product.category in ('Smirnoff / RTD','Hard Seltzer') then '🍹'
    else '🍸'
  end;

  insert into public.bar_menu_items(
    company_id,product_id,display_name,category,station,sale_price_override,emoji,active,sort_order
  ) values (
    v_product.company_id,v_product.id,v_product.name,v_product.category,'bar',p_sale_price,v_emoji,true,0
  )
  on conflict(company_id,product_id)
  do update set display_name=excluded.display_name,category=excluded.category,station='bar',
                sale_price_override=excluded.sale_price_override,emoji=excluded.emoji,active=true,updated_at=now();

  return jsonb_build_object(
    'product_id',v_product.id,
    'inventory_item_id',v_inventory_id,
    'name',v_product.name,
    'category',v_product.category,
    'sale_price',p_sale_price,
    'reference_cost',coalesce(v_product.cost_estimate,0),
    'message','Producto agregado a Carta e Inventario. Stock inicial 0; cargá existencias antes de practicar ventas.'
  );
end;
$$;

revoke all on function public.bar_activate_reference_product(uuid,numeric) from public, anon;
grant execute on function public.bar_activate_reference_product(uuid,numeric) to authenticated;
