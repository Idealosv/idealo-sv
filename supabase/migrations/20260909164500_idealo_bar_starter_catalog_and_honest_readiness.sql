create or replace function public.bar_seed_starter_catalog(p_company_id uuid)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v_inv record;
  v_prod record;
  v_inventory_id uuid;
  v_product_id uuid;
  v_warehouse_id uuid;
  v_location record;
  v_active_products int:=0;
  v_draft_products int:=0;
begin
  if auth.uid() is not null and not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede preparar la carta inicial.';
  end if;

  select id into v_warehouse_id from public.inventory_warehouses where company_id=p_company_id and code='BAR-BOD' and active=true limit 1;
  if v_warehouse_id is null then raise exception 'Primero ejecuta Preparar base inicial para crear la Bodega del bar.'; end if;

  for v_inv in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-BEER-PILSENER","name":"Pilsener","brand":"Pilsener"},
      {"sku":"BAR-BEER-SUPREMA","name":"Suprema","brand":"Suprema"},
      {"sku":"BAR-BEER-GOLDEN","name":"Golden","brand":"Golden"},
      {"sku":"BAR-BEER-CORONA","name":"Corona","brand":"Corona"},
      {"sku":"BAR-BEER-MODELO","name":"Modelo","brand":"Modelo"},
      {"sku":"BAR-BEER-HEINEKEN","name":"Heineken","brand":"Heineken"}
    ]'::jsonb) as x(sku text,name text,brand text)
  loop
    insert into public.inventory_items(company_id,sku,name,category,subcategory,unit,current_stock,average_cost,minimum_stock,reorder_point,target_stock,active,notes,brand,item_type,warehouse_id)
    values(p_company_id,v_inv.sku,v_inv.name,'OTHER','BAR','UNIT',0,0,0,0,0,true,'IDEALO BAR · pendiente de conteo físico y costo real',v_inv.brand,'MATERIAL',v_warehouse_id)
    on conflict(company_id,sku) do update set name=excluded.name,subcategory='BAR',active=true,notes=case when public.inventory_items.current_stock=0 and public.inventory_items.average_cost=0 then excluded.notes else public.inventory_items.notes end,warehouse_id=coalesce(public.inventory_items.warehouse_id,excluded.warehouse_id),updated_at=now()
    returning id into v_inventory_id;

    insert into public.bar_inventory_presentations(company_id,inventory_item_id,name,code,units_per_presentation,sale_price,active)
    values
      (p_company_id,v_inventory_id,'Unidad','UNIT',1,case when v_inv.sku='BAR-BEER-PILSENER' then 1.50 else null end,true),
      (p_company_id,v_inventory_id,'3 unidades','X3',3,case when v_inv.sku='BAR-BEER-PILSENER' then 4.00 else null end,true),
      (p_company_id,v_inventory_id,'Six Pack','X6',6,case when v_inv.sku='BAR-BEER-PILSENER' then 7.50 else null end,true),
      (p_company_id,v_inventory_id,'Caja x24','X24',24,null,true)
    on conflict(company_id,inventory_item_id,name) do update set units_per_presentation=excluded.units_per_presentation,sale_price=coalesce(excluded.sale_price,public.bar_inventory_presentations.sale_price),active=true,updated_at=now();

    for v_location in select id,code from public.inventory_locations where company_id=p_company_id and warehouse_id=v_warehouse_id and code in ('BODEGA','REFRIG','BARRA') and active=true
    loop
      insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity)
      values(p_company_id,v_inventory_id,v_warehouse_id,v_location.id,case v_location.code when 'BODEGA' then 'WAREHOUSE' when 'REFRIG' then 'FRIDGE' else 'BAR' end,0)
      on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do nothing;
    end loop;
  end loop;

  for v_prod in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-PILSENER-UNIT","name":"Pilsener","category":"Cervezas","price":1.50,"active":true,"station":"bar","recipe_sku":"BAR-BEER-PILSENER","recipe_qty":1},
      {"sku":"BAR-PILSENER-X3","name":"Pilsener 3 unidades","category":"Cervezas","price":4.00,"active":true,"station":"bar","recipe_sku":"BAR-BEER-PILSENER","recipe_qty":3},
      {"sku":"BAR-PILSENER-X6","name":"Pilsener Six Pack x6","category":"Cervezas","price":7.50,"active":true,"station":"bar","recipe_sku":"BAR-BEER-PILSENER","recipe_qty":6},
      {"sku":"BAR-PILSENER-X24","name":"Pilsener Caja x24","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-PILSENER","recipe_qty":24},
      {"sku":"BAR-BALDE-PILSENER-X6","name":"Balde Pilsener x6","category":"Combos","price":0,"active":false,"station":"bar","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-HIELERAZO","name":"Hielerazo","category":"Combos","price":0,"active":false,"station":"bar","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-SUPREMA-UNIT","name":"Suprema","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-SUPREMA","recipe_qty":1},
      {"sku":"BAR-GOLDEN-UNIT","name":"Golden","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-GOLDEN","recipe_qty":1},
      {"sku":"BAR-CORONA-UNIT","name":"Corona","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-CORONA","recipe_qty":1},
      {"sku":"BAR-MODELO-UNIT","name":"Modelo","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-MODELO","recipe_qty":1},
      {"sku":"BAR-HEINEKEN-UNIT","name":"Heineken","category":"Cervezas","price":0,"active":false,"station":"bar","recipe_sku":"BAR-BEER-HEINEKEN","recipe_qty":1},
      {"sku":"BAR-HAMBURGUESA","name":"Hamburguesa","category":"Hamburguesas","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-ALITAS","name":"Alitas","category":"Alitas","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-PAPAS","name":"Papas","category":"Papas","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-HOTDOG","name":"Hot Dog","category":"Hot Dogs","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-NACHOS","name":"Nachos","category":"Nachos","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null},
      {"sku":"BAR-TACOS","name":"Tacos","category":"Tacos","price":0,"active":false,"station":"kitchen","recipe_sku":null,"recipe_qty":null}
    ]'::jsonb) as x(sku text,name text,category text,price numeric,active boolean,station text,recipe_sku text,recipe_qty numeric)
  loop
    select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_prod.sku order by created_at limit 1;
    if v_product_id is null then
      insert into public.finished_products(company_id,sku,name,category,subcategory,unit,sale_price,active,requires_production,affects_inventory,status,tags,description,internal_notes)
      values(p_company_id,v_prod.sku,v_prod.name,v_prod.category,'BAR','unidad',v_prod.price,v_prod.active,false,false,'ACTIVE',array['bar'],case when v_prod.active then 'Producto activo de IDEALO BAR.' else 'Borrador de IDEALO BAR: falta confirmar precio y/o receta real.' end,case when v_prod.active then null else 'NO ACTIVAR PARA VENTA hasta completar datos reales.' end)
      returning id into v_product_id;
    else
      update public.finished_products set name=v_prod.name,category=v_prod.category,subcategory='BAR',sale_price=case when v_prod.active then v_prod.price else sale_price end,active=case when v_prod.active then true else active end,tags=case when not ('bar'=any(tags)) then array_append(tags,'bar') else tags end,updated_at=now() where id=v_product_id;
    end if;

    insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,active,sort_order)
    values(p_company_id,v_product_id,v_prod.name,v_prod.category,v_prod.station,case when v_prod.active then v_prod.price else null end,v_prod.active,case when v_prod.active then 10 else 900 end)
    on conflict(company_id,product_id) do update set display_name=excluded.display_name,category=excluded.category,station=excluded.station,sale_price_override=case when excluded.active then excluded.sale_price_override else public.bar_menu_items.sale_price_override end,active=case when excluded.active then true else public.bar_menu_items.active end,updated_at=now();

    if v_prod.recipe_sku is not null then
      select id into v_inventory_id from public.inventory_items where company_id=p_company_id and sku=v_prod.recipe_sku;
      insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes)
      values(p_company_id,v_product_id,v_inventory_id,v_prod.recipe_qty,0,v_prod.active,case when v_prod.active then 'Receta directa validada por equivalencia de unidades.' else 'Plantilla inactiva; activar solo al confirmar venta/precio real.' end)
      on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,active=excluded.active,notes=excluded.notes,updated_at=now();
    end if;

    if v_prod.active then v_active_products:=v_active_products+1; else v_draft_products:=v_draft_products+1; end if;
  end loop;

  update public.bar_settings set default_dte_environment='test',default_dte_type='01',auto_dte_on_paid=true,receipt_paper_width=80,auto_print_kitchen=false,auto_print_bar=false,updated_at=now() where company_id=p_company_id;

  return jsonb_build_object('active_products',v_active_products,'draft_products',v_draft_products,'stock_initialized_at_zero',true,'known_prices',jsonb_build_object('pilsener_unit',1.50,'pilsener_x3',4.00,'pilsener_x6',7.50));
end;
$$;

grant execute on function public.bar_seed_starter_catalog(uuid) to authenticated;

create or replace function public.bar_commercial_readiness(p_company_id uuid)
returns jsonb
language plpgsql
stable
set search_path=public
as $$
declare
 v_company public.companies%rowtype; v_settings public.bar_settings%rowtype;
 v_tables int;v_menu int;v_staff int;v_operational_staff int;v_cash int;v_wh int;v_loc int;v_recipes int;v_required_inventory int;v_stocked_inventory int;
 v_printers boolean;v_fiscal boolean;v_fiscal_activity_match boolean;v_establishment_ready boolean;v_dte_prod boolean;
 v_required_ok int;v_required_total int:=9;v_ready boolean;v_roles jsonb;v_checks jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.erp_can_read(p_company_id) and not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Sin acceso a la puesta en marcha del bar.'; end if;
 select * into v_company from public.companies where id=p_company_id; if not found then raise exception 'Empresa no encontrada.'; end if;
 select * into v_settings from public.bar_settings where company_id=p_company_id;
 select count(*) into v_tables from public.bar_tables where company_id=p_company_id and active=true;
 select count(*) into v_menu from public.bar_menu_items where company_id=p_company_id and active=true;
 select count(*) into v_staff from public.bar_staff_assignments where company_id=p_company_id and active=true;
 select count(*) into v_operational_staff from public.bar_staff_assignments where company_id=p_company_id and active=true and bar_role not in ('owner','manager');
 select count(*) into v_cash from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)<>'BANK';
 select count(*) into v_wh from public.inventory_warehouses where company_id=p_company_id and active=true;
 select count(*) into v_loc from public.inventory_locations where company_id=p_company_id and active=true;
 select count(*) into v_recipes from public.bar_recipe_components where company_id=p_company_id and active=true;
 select count(distinct r.inventory_item_id) into v_required_inventory from public.bar_recipe_components r join public.bar_menu_items m on m.company_id=r.company_id and m.product_id=r.product_id and m.active=true where r.company_id=p_company_id and r.active=true;
 select count(distinct r.inventory_item_id) into v_stocked_inventory from public.bar_recipe_components r join public.bar_menu_items m on m.company_id=r.company_id and m.product_id=r.product_id and m.active=true join public.inventory_items i on i.id=r.inventory_item_id and i.current_stock>0 where r.company_id=p_company_id and r.active=true;
 select coalesce(jsonb_object_agg(bar_role,n),'{}'::jsonb) into v_roles from (select bar_role,count(*) n from public.bar_staff_assignments where company_id=p_company_id and active=true group by bar_role)x;
 v_printers:=coalesce(nullif(trim(v_settings.kitchen_printer_name),'') is not null and nullif(trim(v_settings.bar_printer_name),'') is not null,false);
 v_fiscal:=nullif(trim(coalesce(v_company.nit,'')),'') is not null and nullif(trim(coalesce(v_company.nrc,'')),'') is not null and nullif(trim(coalesce(v_company.activity_code,'')),'') is not null and nullif(trim(coalesce(v_company.department_code,'')),'') is not null and nullif(trim(coalesce(v_company.municipality_code,'')),'') is not null and nullif(trim(coalesce(v_company.address,'')),'') is not null;
 v_fiscal_activity_match:=lower(coalesce(v_company.business_activity,'')) ~ '(bar|restaurante|bebida|alimento|comida|cerveza)';
 v_establishment_ready:=coalesce(nullif(trim(v_company.mh_establishment_code),''),nullif(trim(v_company.establishment_code),'')) is not null and coalesce(nullif(trim(v_company.mh_point_of_sale_code),''),nullif(trim(v_company.point_of_sale_code),'')) is not null;
 v_dte_prod:=exists(select 1 from public.dte_runtime_settings r where r.company_id=p_company_id and r.environment='production' and r.production_enabled=true and r.production_approved=true);
 v_required_ok:=(case when v_settings.company_id is not null then 1 else 0 end)+(case when v_staff>0 then 1 else 0 end)+(case when v_cash>0 then 1 else 0 end)+(case when v_tables>0 then 1 else 0 end)+(case when v_menu>0 then 1 else 0 end)+(case when v_wh>0 and v_loc>=3 then 1 else 0 end)+(case when v_recipes>0 then 1 else 0 end)+(case when v_required_inventory>0 and v_stocked_inventory=v_required_inventory then 1 else 0 end)+(case when v_fiscal then 1 else 0 end);
 v_ready:=v_required_ok=v_required_total;
 v_checks:=jsonb_build_array(
  jsonb_build_object('id','settings','label','Configuración del negocio','required',true,'ok',v_settings.company_id is not null,'detail',case when v_settings.company_id is null then 'Ejecuta Preparar base inicial.' else coalesce(v_settings.business_name,'IDEALO BAR') end),
  jsonb_build_object('id','staff','label','Personal y permisos','required',true,'ok',v_staff>0,'detail',v_staff||' usuario(s) activo(s)'),
  jsonb_build_object('id','operational_staff','label','Equipo operativo','required',false,'ok',v_operational_staff>0,'detail',case when v_operational_staff>0 then v_operational_staff||' empleado(s) operativo(s)' else 'Solo hay Propietario/Gerente; agrega Cajero, Mesero, Cocina, Barra o Bodega cuando existan usuarios reales' end),
  jsonb_build_object('id','cash','label','Caja operativa','required',true,'ok',v_cash>0,'detail',v_cash||' cuenta(s) de caja'),
  jsonb_build_object('id','tables','label','Mesas / salón','required',true,'ok',v_tables>0,'detail',v_tables||' mesa(s)'),
  jsonb_build_object('id','menu','label','Carta real del bar','required',true,'ok',v_menu>0,'detail',v_menu||' producto(s) activo(s); borradores sin precio no se venden'),
  jsonb_build_object('id','locations','label','Bodega · Refrigerador · Barra','required',true,'ok',v_wh>0 and v_loc>=3,'detail',v_wh||' bodega(s), '||v_loc||' ubicación(es)'),
  jsonb_build_object('id','recipes','label','Recetas / consumo de inventario','required',true,'ok',v_recipes>0,'detail',v_recipes||' componente(s) activo(s)'),
  jsonb_build_object('id','stock','label','Conteo físico inicial','required',true,'ok',v_required_inventory>0 and v_stocked_inventory=v_required_inventory,'detail',v_stocked_inventory||' de '||v_required_inventory||' insumo(s) de la carta activa tienen existencia mayor a cero'),
  jsonb_build_object('id','fiscal','label','Perfil fiscal básico','required',true,'ok',v_fiscal,'detail',case when v_fiscal then 'NIT/NRC/actividad/dirección presentes' else 'Completa NIT, NRC, actividad y dirección' end),
  jsonb_build_object('id','fiscal_activity','label','Actividad fiscal compatible con bar','required',false,'ok',v_fiscal_activity_match,'detail',case when v_fiscal_activity_match then coalesce(v_company.business_activity,'Actividad registrada') else 'La actividad actual es '||coalesce(v_company.business_activity,'sin definir')||'; verificar en MH antes de emitir ventas del bar' end),
  jsonb_build_object('id','establishment','label','Establecimiento y punto de venta MH','required',false,'ok',v_establishment_ready,'detail',case when v_establishment_ready then 'Códigos de establecimiento/punto de venta presentes' else 'Faltan códigos MH de establecimiento y/o punto de venta' end),
  jsonb_build_object('id','printers','label','Impresoras Cocina y Barra','required',false,'ok',v_printers,'detail',case when v_printers then 'Nombres de impresora configurados' else 'Modo navegador 80 mm activo; agrega nombres físicos cuando conectes impresoras' end),
  jsonb_build_object('id','dte_production','label','DTE PRODUCCIÓN aprobado','required',false,'ok',v_dte_prod and v_fiscal_activity_match and v_establishment_ready,'detail',case when v_dte_prod and v_fiscal_activity_match and v_establishment_ready then 'Producción habilitada, fiscalmente compatible y con establecimiento' else 'TEST disponible; PRODUCCIÓN permanece bloqueada hasta completar preflight fiscal' end)
 );
 return jsonb_build_object('ready_for_sales',v_ready,'score',round((v_required_ok::numeric/v_required_total)*100,0),'required_ok',v_required_ok,'required_total',v_required_total,'ready_for_fiscal_production',v_fiscal and v_fiscal_activity_match and v_establishment_ready and v_dte_prod,'checks',v_checks,'role_counts',v_roles,'commercial_ready_at',v_settings.commercial_ready_at,'paper_width',coalesce(v_settings.receipt_paper_width,80));
end;
$$;
