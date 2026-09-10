create or replace function public.bar_seed_complete_beverage_catalog(p_company_id uuid)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v_wh uuid;
  v_loc record;
  v_row record;
  v_inv_id uuid;
  v_product_id uuid;
  v_size record;
  v_product_sku text;
  v_product_name text;
  v_product_category text;
  v_inventory_count int:=0;
  v_product_count int:=0;
  v_recipe_count int:=0;
  v_draft_count int:=0;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  if not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede preparar la biblioteca de bebidas.';
  end if;

  select id into v_wh from public.inventory_warehouses where company_id=p_company_id and code='BAR-BOD' and active=true limit 1;
  if v_wh is null then raise exception 'Primero prepara la Bodega del bar.'; end if;

  for v_row in
    select * from jsonb_to_recordset('[
      {"inv_sku":"BAR-BEER-REGIA","product_sku":"BAR-REGIA-UNIT","name":"Regia","brand":"Regia","category":"Cervezas"},
      {"inv_sku":"BAR-BEER-MICHELOB-ULTRA","product_sku":"BAR-MICHELOB-ULTRA-UNIT","name":"Michelob Ultra","brand":"Michelob Ultra","category":"Cervezas"},
      {"inv_sku":"BAR-BEER-STELLA","product_sku":"BAR-STELLA-UNIT","name":"Stella Artois","brand":"Stella Artois","category":"Cervezas"},
      {"inv_sku":"BAR-BEER-GOLDEN-EXTRA","product_sku":"BAR-GOLDEN-EXTRA-UNIT","name":"Golden Extra","brand":"Golden Extra","category":"Cervezas"},
      {"inv_sku":"BAR-BEER-GALLO","product_sku":"BAR-GALLO-UNIT","name":"Gallo","brand":"Gallo","category":"Cervezas"},
      {"inv_sku":"BAR-RTD-SMIRNOFF-ICE-ORIGINAL","product_sku":"BAR-SMIRNOFF-ICE-ORIGINAL","name":"Smirnoff Ice Original","brand":"Smirnoff","category":"Smirnoff / RTD"},
      {"inv_sku":"BAR-RTD-SMIRNOFF-ICE-GREEN-APPLE","product_sku":"BAR-SMIRNOFF-ICE-GREEN-APPLE","name":"Smirnoff Ice Green Apple","brand":"Smirnoff","category":"Smirnoff / RTD"},
      {"inv_sku":"BAR-RTD-SMIRNOFF-ICE-GUARANA","product_sku":"BAR-SMIRNOFF-ICE-GUARANA","name":"Smirnoff Ice Guaraná","brand":"Smirnoff","category":"Smirnoff / RTD"},
      {"inv_sku":"BAR-RTD-SMIRNOFF-ICE-RASPBERRY","product_sku":"BAR-SMIRNOFF-ICE-RASPBERRY","name":"Smirnoff Ice Frambuesa","brand":"Smirnoff","category":"Smirnoff / RTD"},
      {"inv_sku":"BAR-ENERGY-RED-BULL","product_sku":"BAR-RED-BULL","name":"Red Bull","brand":"Red Bull","category":"Energizantes"},
      {"inv_sku":"BAR-ENERGY-MONSTER","product_sku":"BAR-MONSTER","name":"Monster","brand":"Monster","category":"Energizantes"},
      {"inv_sku":"BAR-ENERGY-ADRENALINE","product_sku":"BAR-ADRENALINE-RUSH","name":"Adrenaline Rush","brand":"Adrenaline Rush","category":"Energizantes"},
      {"inv_sku":"BAR-ENERGY-RAPTOR","product_sku":"BAR-RAPTOR","name":"Raptor","brand":"Raptor","category":"Energizantes"},
      {"inv_sku":"BAR-HYDRATION-ELECTROLIT","product_sku":"BAR-ELECTROLIT","name":"Electrolit","brand":"Electrolit","category":"Hidratantes"},
      {"inv_sku":"BAR-HYDRATION-GATORADE","product_sku":"BAR-GATORADE","name":"Gatorade","brand":"Gatorade","category":"Hidratantes"},
      {"inv_sku":"BAR-MIX-COCA-COLA","product_sku":"BAR-COCA-COLA","name":"Coca-Cola","brand":"Coca-Cola","category":"Bebidas sin alcohol"},
      {"inv_sku":"BAR-MIX-SPRITE","product_sku":"BAR-SPRITE","name":"Sprite","brand":"Sprite","category":"Bebidas sin alcohol"},
      {"inv_sku":"BAR-MIX-7UP","product_sku":"BAR-7UP","name":"7Up","brand":"7Up","category":"Bebidas sin alcohol"},
      {"inv_sku":"BAR-MIX-GINGER-ALE","product_sku":"BAR-GINGER-ALE","name":"Ginger Ale","brand":null,"category":"Mezcladores"},
      {"inv_sku":"BAR-MIX-TONIC","product_sku":"BAR-AGUA-TONICA","name":"Agua tónica","brand":null,"category":"Mezcladores"},
      {"inv_sku":"BAR-MIX-CLAMATO","product_sku":"BAR-CLAMATO","name":"Clamato","brand":"Clamato","category":"Mezcladores"}
    ]'::jsonb) as x(inv_sku text,product_sku text,name text,brand text,category text)
  loop
    insert into public.inventory_items(company_id,sku,name,category,subcategory,unit,current_stock,average_cost,minimum_stock,reorder_point,target_stock,active,notes,brand,item_type,warehouse_id)
    values(p_company_id,v_row.inv_sku,v_row.name,'OTHER','BAR','UNIT',0,0,0,0,0,true,'IDEALO BAR · bebida pendiente de conteo físico y costo real',v_row.brand,'MATERIAL',v_wh)
    on conflict(company_id,sku) do update set name=excluded.name,subcategory='BAR',active=true,warehouse_id=coalesce(public.inventory_items.warehouse_id,excluded.warehouse_id),brand=coalesce(public.inventory_items.brand,excluded.brand),updated_at=now()
    returning id into v_inv_id;

    insert into public.bar_inventory_presentations(company_id,inventory_item_id,name,code,units_per_presentation,active)
    values(p_company_id,v_inv_id,'Unidad','UNIT',1,true)
    on conflict(company_id,inventory_item_id,name) do update set units_per_presentation=1,active=true,updated_at=now();

    for v_loc in select id,code from public.inventory_locations where company_id=p_company_id and warehouse_id=v_wh and code in ('BODEGA','REFRIG','BARRA') and active=true loop
      insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity,updated_by)
      values(p_company_id,v_inv_id,v_wh,v_loc.id,case v_loc.code when 'BODEGA' then 'WAREHOUSE' when 'REFRIG' then 'FRIDGE' else 'BAR' end,0,auth.uid())
      on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do nothing;
    end loop;

    select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_row.product_sku order by created_at limit 1;
    if v_product_id is null then
      insert into public.finished_products(company_id,sku,name,category,subcategory,unit,sale_price,active,requires_production,affects_inventory,status,tags,description,internal_notes)
      values(p_company_id,v_row.product_sku,v_row.name,v_row.category,'BAR','unidad',0,false,false,false,'ACTIVE',array['bar','bebidas'],'Borrador de bebida para IDEALO BAR.','NO ACTIVAR PARA VENTA hasta confirmar precio real.')
      returning id into v_product_id;
    end if;
    insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,active,sort_order)
    values(p_company_id,v_product_id,v_row.name,v_row.category,'bar',null,false,500)
    on conflict(company_id,product_id) do update set display_name=excluded.display_name,category=excluded.category,station='bar',updated_at=now();
    insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by)
    values(p_company_id,v_product_id,v_inv_id,1,0,true,'Receta directa: descuenta 1 unidad por venta.',auth.uid())
    on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=1,waste_percent=0,active=true,notes=excluded.notes,updated_at=now();
    v_inventory_count:=v_inventory_count+1; v_product_count:=v_product_count+1; v_recipe_count:=v_recipe_count+1; v_draft_count:=v_draft_count+1;
  end loop;

  for v_row in
    select * from jsonb_to_recordset('[
      {"code":"VOD-SMIRNOFF","name":"Smirnoff Vodka","brand":"Smirnoff","category":"Vodka"},
      {"code":"VOD-ABSOLUT","name":"Absolut","brand":"Absolut","category":"Vodka"},
      {"code":"VOD-GREY-GOOSE","name":"Grey Goose","brand":"Grey Goose","category":"Vodka"},
      {"code":"VOD-TITOS","name":"Tito''s","brand":"Tito''s","category":"Vodka"},
      {"code":"WHI-BUCHANANS-12","name":"Buchanan''s 12","brand":"Buchanan''s","category":"Whisky"},
      {"code":"WHI-JW-BLACK","name":"Johnnie Walker Black","brand":"Johnnie Walker","category":"Whisky"},
      {"code":"WHI-CHIVAS-12","name":"Chivas Regal 12","brand":"Chivas Regal","category":"Whisky"},
      {"code":"WHI-OLD-PARR-12","name":"Old Parr 12","brand":"Old Parr","category":"Whisky"},
      {"code":"WHI-JACK-DANIELS","name":"Jack Daniel''s","brand":"Jack Daniel''s","category":"Whisky"},
      {"code":"TEQ-JOSE-CUERVO","name":"José Cuervo","brand":"José Cuervo","category":"Tequila"},
      {"code":"TEQ-1800","name":"Tequila 1800","brand":"1800","category":"Tequila"},
      {"code":"TEQ-DON-JULIO","name":"Don Julio","brand":"Don Julio","category":"Tequila"},
      {"code":"TEQ-PATRON","name":"Patrón","brand":"Patrón","category":"Tequila"},
      {"code":"RON-BACARDI","name":"Bacardí","brand":"Bacardí","category":"Ron"},
      {"code":"RON-FLOR-DE-CANA","name":"Flor de Caña","brand":"Flor de Caña","category":"Ron"},
      {"code":"RON-ZACAPA","name":"Zacapa","brand":"Zacapa","category":"Ron"},
      {"code":"GIN-BEEFEATER","name":"Beefeater","brand":"Beefeater","category":"Gin"},
      {"code":"GIN-BOMBAY-SAPPHIRE","name":"Bombay Sapphire","brand":"Bombay Sapphire","category":"Gin"},
      {"code":"GIN-TANQUERAY","name":"Tanqueray","brand":"Tanqueray","category":"Gin"},
      {"code":"LIC-JAGERMEISTER","name":"Jägermeister","brand":"Jägermeister","category":"Licores"},
      {"code":"LIC-FIREBALL","name":"Fireball","brand":"Fireball","category":"Licores"},
      {"code":"LIC-BAILEYS","name":"Baileys","brand":"Baileys","category":"Licores"},
      {"code":"LIC-KAHLUA","name":"Kahlúa","brand":"Kahlúa","category":"Licores"},
      {"code":"LIC-AMARETTO","name":"Amaretto","brand":null,"category":"Licores"},
      {"code":"LIC-MALIBU","name":"Malibu","brand":"Malibu","category":"Licores"}
    ]'::jsonb) as x(code text,name text,brand text,category text)
  loop
    insert into public.inventory_items(company_id,sku,name,category,subcategory,unit,current_stock,average_cost,minimum_stock,reorder_point,target_stock,active,notes,brand,item_type,warehouse_id,secondary_unit,conversion_factor)
    values(p_company_id,'BAR-LIQ-'||v_row.code,v_row.name||' · botella base 750 ml','OTHER','BAR','ML',0,0,0,0,0,true,'IDEALO BAR · licor controlado por mililitros; pendiente conteo físico y costo real',v_row.brand,'MATERIAL',v_wh,'BOTTLE',750)
    on conflict(company_id,sku) do update set name=excluded.name,subcategory='BAR',unit='ML',secondary_unit='BOTTLE',conversion_factor=750,active=true,warehouse_id=coalesce(public.inventory_items.warehouse_id,excluded.warehouse_id),brand=coalesce(public.inventory_items.brand,excluded.brand),updated_at=now()
    returning id into v_inv_id;

    insert into public.bar_inventory_presentations(company_id,inventory_item_id,name,code,units_per_presentation,active)
    values (p_company_id,v_inv_id,'Sencillo 45 ml','S45',45,true),(p_company_id,v_inv_id,'Doble 90 ml','D90',90,true),(p_company_id,v_inv_id,'Botella 750 ml','B750',750,true)
    on conflict(company_id,inventory_item_id,name) do update set units_per_presentation=excluded.units_per_presentation,active=true,updated_at=now();

    for v_loc in select id,code from public.inventory_locations where company_id=p_company_id and warehouse_id=v_wh and code in ('BODEGA','REFRIG','BARRA') and active=true loop
      insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity,updated_by)
      values(p_company_id,v_inv_id,v_wh,v_loc.id,case v_loc.code when 'BODEGA' then 'WAREHOUSE' when 'REFRIG' then 'FRIDGE' else 'BAR' end,0,auth.uid())
      on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do nothing;
    end loop;

    for v_size in select * from (values ('S45',45::numeric,'Sencillo 45 ml'),('D90',90::numeric,'Doble 90 ml'),('B750',750::numeric,'Botella 750 ml')) as s(code,ml,label)
    loop
      v_product_sku:='BAR-'||v_row.code||'-'||v_size.code;
      v_product_name:=v_row.name||' · '||v_size.label;
      v_product_category:=case when v_row.category='Licores' and v_size.code='S45' then 'Shots' else v_row.category end;
      select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_product_sku order by created_at limit 1;
      if v_product_id is null then
        insert into public.finished_products(company_id,sku,name,category,subcategory,unit,sale_price,active,requires_production,affects_inventory,status,tags,description,internal_notes)
        values(p_company_id,v_product_sku,v_product_name,v_product_category,'BAR',case when v_size.code='B750' then 'botella' else 'trago' end,0,false,false,false,'ACTIVE',array['bar','licor','ml'],'Borrador de bebida para IDEALO BAR.','NO ACTIVAR PARA VENTA hasta confirmar precio real.')
        returning id into v_product_id;
      end if;
      insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,active,sort_order)
      values(p_company_id,v_product_id,v_product_name,v_product_category,'bar',null,false,600)
      on conflict(company_id,product_id) do update set display_name=excluded.display_name,category=excluded.category,station='bar',updated_at=now();
      insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by)
      values(p_company_id,v_product_id,v_inv_id,v_size.ml,0,true,'Receta volumétrica: descuenta '||v_size.ml||' ml del mismo licor.',auth.uid())
      on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,waste_percent=0,active=true,notes=excluded.notes,updated_at=now();
      v_product_count:=v_product_count+1; v_recipe_count:=v_recipe_count+1; v_draft_count:=v_draft_count+1;
    end loop;
    v_inventory_count:=v_inventory_count+1;
  end loop;

  for v_row in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-COCKTAIL-MARGARITA","name":"Margarita","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-MOJITO","name":"Mojito","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-PINA-COLADA","name":"Piña Colada","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-TEQUILA-SUNRISE","name":"Tequila Sunrise","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-CUBA-LIBRE","name":"Cuba Libre","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-DAIQUIRI","name":"Daiquirí","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-SEX-ON-THE-BEACH","name":"Sex on the Beach","category":"Cócteles"},
      {"sku":"BAR-COCKTAIL-SANGRIA","name":"Sangría","category":"Cócteles"},
      {"sku":"BAR-MICHELADA-CLASICA","name":"Michelada clásica","category":"Micheladas"},
      {"sku":"BAR-MICHELADA-CLAMATO","name":"Michelada con Clamato","category":"Micheladas"}
    ]'::jsonb) as x(sku text,name text,category text)
  loop
    select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_row.sku order by created_at limit 1;
    if v_product_id is null then
      insert into public.finished_products(company_id,sku,name,category,subcategory,unit,sale_price,active,requires_production,affects_inventory,status,tags,description,internal_notes)
      values(p_company_id,v_row.sku,v_row.name,v_row.category,'BAR','unidad',0,false,false,false,'ACTIVE',array['bar','preparado'],'Borrador de bebida preparada.','Pendiente confirmar receta exacta y precio real del negocio.')
      returning id into v_product_id;
    end if;
    insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,active,sort_order)
    values(p_company_id,v_product_id,v_row.name,v_row.category,'bar',null,false,700)
    on conflict(company_id,product_id) do update set display_name=excluded.display_name,category=excluded.category,station='bar',updated_at=now();
    v_product_count:=v_product_count+1; v_draft_count:=v_draft_count+1;
  end loop;

  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id)
  values(p_company_id,'CATALOG','BEVERAGE_LIBRARY_SEEDED','company',p_company_id::text,jsonb_build_object('inventory_items_touched',v_inventory_count,'products_touched',v_product_count,'recipes_touched',v_recipe_count,'draft_products',v_draft_count,'liquor_base_unit','ML','single_ml',45,'double_ml',90,'bottle_ml',750),auth.uid());

  return jsonb_build_object('inventory_items_touched',v_inventory_count,'products_touched',v_product_count,'recipes_touched',v_recipe_count,'draft_products',v_draft_count,'liquor_control',jsonb_build_object('base_unit','ML','single',45,'double',90,'bottle',750));
end;
$$;

grant execute on function public.bar_seed_complete_beverage_catalog(uuid) to authenticated;
