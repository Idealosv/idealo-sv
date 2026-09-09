create or replace function public.bar_operational_smoke_test(p_company_id uuid)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v_result jsonb;
  v_table_id uuid;
  v_cash_account uuid;
  v_session_id uuid;
  v_menu record;
  v_recipe record;
  v_order public.bar_orders%rowtype;
  v_item_id uuid;
  v_split1 uuid;
  v_split2 uuid;
  v_loc_id uuid;
  v_stock_before numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  if not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede ejecutar la prueba integral.'; end if;
  begin
    select m.id menu_item_id,m.product_id,m.display_name,m.station,coalesce(m.sale_price_override,p.sale_price) price into v_menu
    from public.bar_menu_items m join public.finished_products p on p.id=m.product_id
    where m.company_id=p_company_id and m.active=true and p.active=true and coalesce(m.sale_price_override,p.sale_price)>0
      and exists(select 1 from public.bar_recipe_components r where r.company_id=m.company_id and r.product_id=m.product_id and r.active=true)
    order by m.sort_order,m.created_at limit 1;
    if v_menu.menu_item_id is null then raise exception 'No hay producto activo con precio y receta para probar.'; end if;
    select r.inventory_item_id,r.quantity_per_unit,i.current_stock into v_recipe from public.bar_recipe_components r join public.inventory_items i on i.id=r.inventory_item_id where r.company_id=p_company_id and r.product_id=v_menu.product_id and r.active=true order by r.created_at limit 1;
    if v_recipe.inventory_item_id is null then raise exception 'La receta de prueba no tiene inventario.'; end if;
    select id into v_table_id from public.bar_tables where company_id=p_company_id and active=true and status='available' order by name limit 1;
    if v_table_id is null then raise exception 'No hay mesa disponible para la prueba.'; end if;
    select id into v_cash_account from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)<>'BANK' order by created_at limit 1;
    if v_cash_account is null then raise exception 'No hay cuenta de Caja disponible.'; end if;
    select id into v_session_id from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN' order by opened_at desc limit 1;
    if v_session_id is null then v_session_id:=public.open_cash_register(p_company_id,v_cash_account,0,current_date); end if;
    v_stock_before:=coalesce(v_recipe.current_stock,0);
    update public.inventory_items set current_stock=greatest(coalesce(current_stock,0),v_recipe.quantity_per_unit*4),updated_at=now() where id=v_recipe.inventory_item_id;
    select l.id into v_loc_id from public.inventory_locations l join public.inventory_warehouses w on w.id=l.warehouse_id where l.company_id=p_company_id and l.active=true and w.active=true and l.code='BARRA' order by l.created_at limit 1;
    if v_loc_id is not null then
      insert into public.bar_inventory_location_stock(company_id,inventory_item_id,warehouse_id,location_id,location_kind,quantity)
      select p_company_id,v_recipe.inventory_item_id,l.warehouse_id,l.id,'BAR',greatest(coalesce((select quantity from public.bar_inventory_location_stock where company_id=p_company_id and inventory_item_id=v_recipe.inventory_item_id and location_id=l.id limit 1),0),v_recipe.quantity_per_unit*4)
      from public.inventory_locations l where l.id=v_loc_id
      on conflict(company_id,inventory_item_id,warehouse_id,location_id,location_kind) do update set quantity=excluded.quantity,updated_at=now();
    end if;
    v_order:=public.bar_create_order(p_company_id,'table',v_table_id);
    insert into public.bar_order_items(company_id,order_id,menu_item_id,product_id,item_name,station,quantity,unit_price,base_unit_price,status,notes)
    values(p_company_id,v_order.id,v_menu.menu_item_id,v_menu.product_id,v_menu.display_name,v_menu.station,1,v_menu.price,v_menu.price,'new','Prueba integral reversible IDEALO BAR') returning id into v_item_id;
    perform public.bar_send_order(v_order.id);
    perform public.bar_advance_station_item(v_item_id); perform public.bar_advance_station_item(v_item_id); perform public.bar_advance_station_item(v_item_id);
    perform public.bar_set_order_tip(v_order.id,1.00); perform public.bar_request_bill(v_order.id); perform public.bar_create_equal_splits(v_order.id,2);
    select id into v_split1 from public.bar_bill_splits where order_id=v_order.id order by created_at,id limit 1;
    select id into v_split2 from public.bar_bill_splits where order_id=v_order.id and id<>v_split1 order by created_at,id limit 1;
    perform public.bar_take_split_payment(v_split1,'cash','SMOKE-CASH'); perform public.bar_take_split_payment(v_split2,'card','SMOKE-CARD');
    select jsonb_build_object('ok',o.status='paid' and t.status='available','product',v_menu.display_name,'price',v_menu.price,'order_status',o.status,'order_total',o.total,'tip_total',o.tip_total,'table_status',t.status,'item_status',(select status from public.bar_order_items where id=v_item_id),'stock_before',v_stock_before,'stock_after_test',(select current_stock from public.inventory_items where id=v_recipe.inventory_item_id),'split_paid',(select count(*) from public.bar_bill_splits where order_id=o.id and upper(status)='PAID'),'payment_methods',(select coalesce(jsonb_agg(method order by created_at),'[]'::jsonb) from public.bar_payments where order_id=o.id),'print_jobs',(select count(*) from public.bar_print_jobs where order_id=o.id),'dte_test_drafts',(select count(*) from public.dte_documents where bar_order_id=o.id and environment='test')) into v_result from public.bar_orders o join public.bar_tables t on t.id=o.table_id where o.id=v_order.id;
    raise exception using errcode='ZX001',message='IDEALO_BAR_SMOKE_ROLLBACK';
  exception when sqlstate 'ZX001' then null; when others then v_result:=jsonb_build_object('ok',false,'error',sqlerrm,'sqlstate',sqlstate); end;
  return coalesce(v_result,jsonb_build_object('ok',false,'error','La prueba no produjo resultado.'));
end;
$$;
grant execute on function public.bar_operational_smoke_test(uuid) to authenticated;
