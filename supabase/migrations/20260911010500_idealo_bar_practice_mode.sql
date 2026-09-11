create or replace function public.bar_seed_practice_environment(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_demo boolean;
  v_inv record;
  v_prod record;
  v_recipe record;
  v_item_id uuid;
  v_product_id uuid;
  v_count_products int:=0;
  v_count_inventory int:=0;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select demo_mode into v_demo from public.companies where id=p_company_id;
  if not found or coalesce(v_demo,false)=false then raise exception 'Esta función solo puede usarse en una empresa de práctica.'; end if;
  if not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede preparar el modo práctica.'; end if;

  perform public.bar_bootstrap_business(p_company_id,8);
  perform public.bar_seed_starter_catalog(p_company_id);
  perform public.bar_seed_complete_beverage_catalog(p_company_id);
  perform public.bar_prepare_dte_test_runtime(p_company_id);

  update public.bar_settings
  set business_name='IDEALO BAR · PRÁCTICA',default_dte_environment='test',default_dte_type='01',auto_dte_on_paid=true,
      receipt_paper_width=80,auto_print_kitchen=false,auto_print_bar=false,updated_at=now(),updated_by=auth.uid()
  where company_id=p_company_id;

  for v_inv in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-DEMO-BUN","name":"Pan de hamburguesa","unit":"UNIT","bodega":20,"refrigerador":10,"barra":10,"cost":0.35,"min":8,"reorder":12,"target":40},
      {"sku":"BAR-DEMO-PATTY","name":"Torta de carne","unit":"UNIT","bodega":20,"refrigerador":20,"barra":0,"cost":1.10,"min":8,"reorder":12,"target":40},
      {"sku":"BAR-DEMO-CHEESE","name":"Queso porción","unit":"UNIT","bodega":20,"refrigerador":20,"barra":0,"cost":0.30,"min":8,"reorder":12,"target":40},
      {"sku":"BAR-DEMO-WING","name":"Alita de pollo","unit":"UNIT","bodega":50,"refrigerador":50,"barra":0,"cost":0.35,"min":20,"reorder":30,"target":100},
      {"sku":"BAR-DEMO-FRIES","name":"Porción de papas","unit":"UNIT","bodega":20,"refrigerador":20,"barra":0,"cost":0.60,"min":8,"reorder":12,"target":40},
      {"sku":"BAR-DEMO-HOTDOG-BUN","name":"Pan de hot dog","unit":"UNIT","bodega":15,"refrigerador":10,"barra":5,"cost":0.25,"min":6,"reorder":10,"target":30},
      {"sku":"BAR-DEMO-SAUSAGE","name":"Salchicha","unit":"UNIT","bodega":15,"refrigerador":15,"barra":0,"cost":0.55,"min":6,"reorder":10,"target":30},
      {"sku":"BAR-DEMO-NACHOS","name":"Porción base de nachos","unit":"UNIT","bodega":20,"refrigerador":10,"barra":0,"cost":0.75,"min":6,"reorder":10,"target":30},
      {"sku":"BAR-DEMO-TACOS","name":"Porción base de tacos","unit":"UNIT","bodega":15,"refrigerador":15,"barra":0,"cost":1.10,"min":6,"reorder":10,"target":30},
      {"sku":"BAR-DEMO-ICE","name":"Bolsa de hielo","unit":"UNIT","bodega":10,"refrigerador":10,"barra":10,"cost":0.50,"min":5,"reorder":8,"target":30}
    ]'::jsonb) as x(sku text,name text,unit text,bodega numeric,refrigerador numeric,barra numeric,cost numeric,min numeric,reorder numeric,target numeric)
  loop
    insert into public.inventory_items(company_id,sku,name,category,subcategory,item_type,unit,current_stock,average_cost,last_cost,standard_cost,minimum_stock,reorder_point,target_stock,active,notes)
    values(p_company_id,v_inv.sku,v_inv.name,'OTHER','BAR','MATERIAL',v_inv.unit,0,0,0,0,0,0,0,true,'IDEALO BAR · dato de entrenamiento')
    on conflict(company_id,sku) do update set name=excluded.name,subcategory='BAR',item_type='MATERIAL',unit=excluded.unit,active=true,notes='IDEALO BAR · dato de entrenamiento',updated_at=now()
    returning id into v_item_id;
    perform public.bar_save_physical_inventory(v_item_id,v_inv.bodega,v_inv.refrigerador,v_inv.barra,v_inv.cost,v_inv.min,v_inv.reorder,v_inv.target);
    v_count_inventory:=v_count_inventory+1;
  end loop;

  for v_inv in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-BEER-PILSENER","bodega":60,"refrigerador":30,"barra":30,"cost":0.80,"min":24,"reorder":36,"target":120},
      {"sku":"BAR-BEER-SUPREMA","bodega":24,"refrigerador":18,"barra":18,"cost":0.95,"min":12,"reorder":18,"target":60},
      {"sku":"BAR-BEER-GOLDEN","bodega":32,"refrigerador":24,"barra":24,"cost":0.75,"min":18,"reorder":24,"target":80},
      {"sku":"BAR-BEER-CORONA","bodega":12,"refrigerador":12,"barra":12,"cost":1.25,"min":8,"reorder":12,"target":36},
      {"sku":"BAR-BEER-REGIA","bodega":12,"refrigerador":12,"barra":12,"cost":1.05,"min":8,"reorder":12,"target":36},
      {"sku":"BAR-RTD-SMIRNOFF-ICE-ORIGINAL","bodega":8,"refrigerador":8,"barra":8,"cost":1.15,"min":6,"reorder":8,"target":24},
      {"sku":"BAR-ENERGY-RED-BULL","bodega":8,"refrigerador":8,"barra":8,"cost":1.40,"min":6,"reorder":8,"target":24},
      {"sku":"BAR-LIQ-VOD-SMIRNOFF","bodega":750,"refrigerador":750,"barra":750,"cost":0.0107,"min":750,"reorder":1500,"target":2250},
      {"sku":"BAR-LIQ-WHI-BUCHANANS-12","bodega":750,"refrigerador":0,"barra":750,"cost":0.0267,"min":750,"reorder":750,"target":1500}
    ]'::jsonb) as x(sku text,bodega numeric,refrigerador numeric,barra numeric,cost numeric,min numeric,reorder numeric,target numeric)
  loop
    select id into v_item_id from public.inventory_items where company_id=p_company_id and sku=v_inv.sku and active=true and deleted_at is null;
    if v_item_id is not null then
      perform public.bar_save_physical_inventory(v_item_id,v_inv.bodega,v_inv.refrigerador,v_inv.barra,v_inv.cost,v_inv.min,v_inv.reorder,v_inv.target);
      v_count_inventory:=v_count_inventory+1;
    end if;
  end loop;

  update public.bar_menu_items set active=false,updated_at=now() where company_id=p_company_id;

  for v_recipe in
    select * from jsonb_to_recordset('[
      {"product_sku":"BAR-HAMBURGUESA","inventory_sku":"BAR-DEMO-BUN","qty":1},
      {"product_sku":"BAR-HAMBURGUESA","inventory_sku":"BAR-DEMO-PATTY","qty":1},
      {"product_sku":"BAR-HAMBURGUESA","inventory_sku":"BAR-DEMO-CHEESE","qty":1},
      {"product_sku":"BAR-ALITAS","inventory_sku":"BAR-DEMO-WING","qty":6},
      {"product_sku":"BAR-PAPAS","inventory_sku":"BAR-DEMO-FRIES","qty":1},
      {"product_sku":"BAR-HOTDOG","inventory_sku":"BAR-DEMO-HOTDOG-BUN","qty":1},
      {"product_sku":"BAR-HOTDOG","inventory_sku":"BAR-DEMO-SAUSAGE","qty":1},
      {"product_sku":"BAR-NACHOS","inventory_sku":"BAR-DEMO-NACHOS","qty":1},
      {"product_sku":"BAR-TACOS","inventory_sku":"BAR-DEMO-TACOS","qty":1},
      {"product_sku":"BAR-BALDE-PILSENER-X6","inventory_sku":"BAR-BEER-PILSENER","qty":6},
      {"product_sku":"BAR-HIELERAZO","inventory_sku":"BAR-BEER-PILSENER","qty":6},
      {"product_sku":"BAR-HIELERAZO","inventory_sku":"BAR-DEMO-ICE","qty":1}
    ]'::jsonb) as x(product_sku text,inventory_sku text,qty numeric)
  loop
    select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_recipe.product_sku limit 1;
    select id into v_item_id from public.inventory_items where company_id=p_company_id and sku=v_recipe.inventory_sku and active=true and deleted_at is null limit 1;
    if v_product_id is not null and v_item_id is not null then
      insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,active,notes,created_by)
      values(p_company_id,v_product_id,v_item_id,v_recipe.qty,0,true,'Receta de entrenamiento IDEALO BAR',auth.uid())
      on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,waste_percent=0,active=true,notes=excluded.notes,updated_at=now();
    end if;
  end loop;

  for v_prod in
    select * from jsonb_to_recordset('[
      {"sku":"BAR-PILSENER-UNIT","price":1.50},{"sku":"BAR-PILSENER-X3","price":4.00},{"sku":"BAR-PILSENER-X6","price":7.50},
      {"sku":"BAR-SUPREMA-UNIT","price":1.75},{"sku":"BAR-GOLDEN-UNIT","price":1.50},{"sku":"BAR-CORONA-UNIT","price":2.50},{"sku":"BAR-REGIA-UNIT","price":2.00},
      {"sku":"BAR-SMIRNOFF-ICE-ORIGINAL","price":2.50},{"sku":"BAR-RED-BULL","price":2.50},
      {"sku":"BAR-VOD-SMIRNOFF-S45","price":2.50},{"sku":"BAR-VOD-SMIRNOFF-D90","price":4.50},
      {"sku":"BAR-WHI-BUCHANANS-12-S45","price":4.00},{"sku":"BAR-WHI-BUCHANANS-12-D90","price":7.00},
      {"sku":"BAR-BALDE-PILSENER-X6","price":8.00},{"sku":"BAR-HIELERAZO","price":9.00},
      {"sku":"BAR-HAMBURGUESA","price":4.00},{"sku":"BAR-ALITAS","price":5.00},{"sku":"BAR-PAPAS","price":2.50},{"sku":"BAR-HOTDOG","price":2.50},{"sku":"BAR-NACHOS","price":3.00},{"sku":"BAR-TACOS","price":4.00}
    ]'::jsonb) as x(sku text,price numeric)
  loop
    select id into v_product_id from public.finished_products where company_id=p_company_id and sku=v_prod.sku limit 1;
    if v_product_id is not null then
      update public.finished_products set sale_price=v_prod.price,active=true,internal_notes='PRECIO DE ENTRENAMIENTO · no usar como precio comercial real',updated_at=now() where id=v_product_id;
      update public.bar_menu_items set sale_price_override=v_prod.price,active=true,updated_at=now() where company_id=p_company_id and product_id=v_product_id;
      v_count_products:=v_count_products+1;
    end if;
  end loop;

  update public.companies set demo_seeded_at=now(),updated_at=now() where id=p_company_id;

  return jsonb_build_object('mode','practice','products_active',v_count_products,'inventory_items_prepared',v_count_inventory,'tables',(select count(*) from public.bar_tables where company_id=p_company_id and active=true),'dte_environment','test');
end;
$$;

revoke all on function public.bar_seed_practice_environment(uuid) from public, anon;
grant execute on function public.bar_seed_practice_environment(uuid) to authenticated;

create or replace function public.bar_reset_practice_environment(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_demo boolean;
  v_orders int;
  v_sessions int;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select demo_mode into v_demo from public.companies where id=p_company_id;
  if not found or coalesce(v_demo,false)=false then raise exception 'Solo se puede reiniciar una empresa de práctica.'; end if;
  if not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede reiniciar la práctica.'; end if;

  select count(*) into v_orders from public.bar_orders where company_id=p_company_id;
  select count(*) into v_sessions from public.cash_register_sessions where company_id=p_company_id;

  delete from public.bar_dte_requests where company_id=p_company_id;
  delete from public.dte_fiscal_events where dte_document_id in (select id from public.dte_documents where company_id=p_company_id and environment='test');
  delete from public.dte_documents where company_id=p_company_id and environment='test';
  delete from public.dte_control_sequences where company_id=p_company_id and environment='test';

  delete from public.bar_inventory_consumptions where company_id=p_company_id;
  delete from public.bar_location_consumption_allocations where company_id=p_company_id;
  delete from public.bar_inventory_events where company_id=p_company_id;
  delete from public.bar_stock_transfers where company_id=p_company_id;
  delete from public.bar_tip_allocations where company_id=p_company_id;
  delete from public.bar_payments where company_id=p_company_id;
  delete from public.bar_print_jobs where company_id=p_company_id;
  delete from public.bar_reservations where company_id=p_company_id;
  delete from public.bar_order_events where company_id=p_company_id;
  delete from public.bar_order_items where company_id=p_company_id;
  delete from public.bar_orders where company_id=p_company_id;

  delete from public.cash_movements where company_id=p_company_id;
  delete from public.cash_register_cuts where company_id=p_company_id;
  delete from public.cash_register_sessions where company_id=p_company_id;

  delete from public.inventory_movements where company_id=p_company_id and (coalesce(document_type,'') like 'BAR%' or coalesce(reference,'')='IDEALO BAR');
  update public.inventory_items set current_stock=0,average_cost=0,last_cost=0,standard_cost=0,updated_at=now() where company_id=p_company_id and active=true and deleted_at is null and upper(coalesce(subcategory,''))='BAR';
  update public.bar_inventory_location_stock set quantity=0,updated_at=now(),updated_by=auth.uid() where company_id=p_company_id;
  update public.bar_tables set status='available',updated_at=now() where company_id=p_company_id and active=true;
  delete from public.bar_admin_audit where company_id=p_company_id;

  perform public.bar_seed_practice_environment(p_company_id);

  return jsonb_build_object('reset',true,'orders_removed',v_orders,'cash_sessions_removed',v_sessions,'message','Práctica reiniciada. La carta, stock demo y mesas volvieron al estado inicial.');
end;
$$;

revoke all on function public.bar_reset_practice_environment(uuid) from public, anon;
grant execute on function public.bar_reset_practice_environment(uuid) to authenticated;
