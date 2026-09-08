create or replace function public.seed_agency_demo_data(p_company_id uuid, p_created_by uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cafe uuid;
  v_clinica uuid;
  v_lona uuid;
  v_camisa uuid;
  v_quote1 uuid;
  v_quote2 uuid;
  v_work_order uuid;
  v_now timestamptz := now();
  v_valid_until date := (current_date + 10);
begin
  if p_company_id is null or p_created_by is null then
    raise exception 'DEMO_SEED_CONTEXT_REQUIRED';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.demo_mode = true
  ) then
    raise exception 'DEMO_COMPANY_REQUIRED';
  end if;

  if not exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = p_created_by
  ) then
    raise exception 'DEMO_MEMBER_REQUIRED';
  end if;

  if not public.saas_company_operational_access(p_company_id) then
    raise exception 'SAAS_SUBSCRIPTION_INACTIVE';
  end if;

  select id into v_cafe
  from public.clients
  where company_id = p_company_id and email = 'compras@cafe-demo.example'
  order by created_at asc limit 1;
  if v_cafe is null then
    insert into public.clients(company_id,name,email,phone,notes,created_by,status,source)
    values(p_company_id,'[DEMO] Café Central','compras@cafe-demo.example','7000-1001','Cliente ficticio para demostrar cotizaciones, producción y seguimiento.',p_created_by,'active','DEMO')
    returning id into v_cafe;
  end if;

  select id into v_clinica
  from public.clients
  where company_id = p_company_id and email = 'mercadeo@clinica-demo.example'
  order by created_at asc limit 1;
  if v_clinica is null then
    insert into public.clients(company_id,name,email,phone,notes,created_by,status,source)
    values(p_company_id,'[DEMO] Clínica Sonrisa','mercadeo@clinica-demo.example','7000-1002','Cliente ficticio para pruebas del ERP.',p_created_by,'active','DEMO')
    returning id into v_clinica;
  end if;

  if not exists (
    select 1 from public.clients
    where company_id = p_company_id and email = 'proyectos@constructora-demo.example'
  ) then
    insert into public.clients(company_id,name,email,phone,notes,created_by,status,source)
    values(p_company_id,'[DEMO] Constructora Norte','proyectos@constructora-demo.example','7000-1003','Cliente ficticio para pruebas del ERP.',p_created_by,'active','DEMO');
  end if;

  select id into v_lona
  from public.finished_products
  where company_id = p_company_id and sku = 'DEMO-LONA-001'
  order by created_at asc limit 1;
  if v_lona is null then
    insert into public.finished_products(company_id,name,sku,category,description,unit,sale_price,cost_estimate,design_included,requires_production,tags)
    values(p_company_id,'[DEMO] Banner lona 13 oz','DEMO-LONA-001','Impresión gran formato','Banner impreso con acabados básicos.','m²',18,8,true,true,array['DEMO','LONA'])
    returning id into v_lona;
  end if;

  if not exists (select 1 from public.finished_products where company_id=p_company_id and sku='DEMO-PVC-001') then
    insert into public.finished_products(company_id,name,sku,category,description,unit,sale_price,cost_estimate,design_included,requires_production,tags)
    values(p_company_id,'[DEMO] Rótulo PVC 5 mm','DEMO-PVC-001','Rotulación','PVC impreso para señalización interior.','m²',34,16,true,true,array['DEMO','PVC']);
  end if;

  select id into v_camisa
  from public.finished_products
  where company_id = p_company_id and sku = 'DEMO-TEX-001'
  order by created_at asc limit 1;
  if v_camisa is null then
    insert into public.finished_products(company_id,name,sku,category,description,unit,sale_price,cost_estimate,design_included,requires_production,tags)
    values(p_company_id,'[DEMO] Camisa personalizada','DEMO-TEX-001','Textil','Camisa personalizada para marca o evento.','unidad',12.5,6.25,true,true,array['DEMO','TEXTIL'])
    returning id into v_camisa;
  end if;

  if not exists (select 1 from public.finished_products where company_id=p_company_id and sku='DEMO-SUB-001') then
    insert into public.finished_products(company_id,name,sku,category,description,unit,sale_price,cost_estimate,design_included,requires_production,tags)
    values(p_company_id,'[DEMO] Taza personalizada','DEMO-SUB-001','Sublimación','Taza promocional personalizada.','unidad',7.5,3.25,true,true,array['DEMO','SUBLIMACION']);
  end if;

  select id into v_quote1
  from public.quotes
  where company_id=p_company_id and reference='DEMO-APERTURA-001'
  order by created_at asc limit 1;
  if v_quote1 is null then
    insert into public.quotes(company_id,client_id,status,title,reference,project_name,valid_until,subtotal,discount,total,balance_amount,customer_notes,seller_user_id,sent_at,tags)
    values(p_company_id,v_cafe,'SENT','[DEMO] Campaña apertura sucursal','DEMO-APERTURA-001','Apertura Café Central',v_valid_until,216,0,216,216,'Datos ficticios de demostración.',p_created_by,v_now,array['DEMO'])
    returning id into v_quote1;
  end if;

  select id into v_quote2
  from public.quotes
  where company_id=p_company_id and reference='DEMO-UNIFORMES-001'
  order by created_at asc limit 1;
  if v_quote2 is null then
    insert into public.quotes(company_id,client_id,status,title,reference,project_name,valid_until,subtotal,discount,total,balance_amount,customer_notes,seller_user_id,approved_at,tags)
    values(p_company_id,v_clinica,'APPROVED','[DEMO] Uniformes promocionales','DEMO-UNIFORMES-001','Jornada de salud',v_valid_until,250,0,250,250,'Datos ficticios de demostración.',p_created_by,v_now,array['DEMO'])
    returning id into v_quote2;
  end if;

  if not exists (select 1 from public.quote_items where quote_id=v_quote1 and sku='DEMO-LONA-001') then
    insert into public.quote_items(quote_id,product_id,sku,category,description,quantity,unit,unit_price,line_total,unit_cost,cost_total,profit_total,margin_percent,design_included,requires_production)
    values(v_quote1,v_lona,'DEMO-LONA-001','Impresión gran formato','Banner de lona para fachada',12,'m²',18,216,8,96,120,55.56,true,true);
  end if;

  if not exists (select 1 from public.quote_items where quote_id=v_quote2 and sku='DEMO-TEX-001') then
    insert into public.quote_items(quote_id,product_id,sku,category,description,quantity,unit,unit_price,line_total,unit_cost,cost_total,profit_total,margin_percent,design_included,requires_production)
    values(v_quote2,v_camisa,'DEMO-TEX-001','Textil','Camisas personalizadas',20,'unidad',12.5,250,6.25,125,125,50,true,true);
  end if;

  select id into v_work_order
  from public.work_orders
  where quote_id=v_quote2
  order by created_at asc limit 1;
  if v_work_order is null then
    insert into public.work_orders(company_id,quote_id,client_id,status,title,due_at,production_notes,design_status,production_started_at,progress_percent,total,tags)
    values(p_company_id,v_quote2,v_clinica,'PRODUCTION','[DEMO] Producción uniformes Clínica Sonrisa',v_now + interval '3 days','Orden ficticia precargada para demostrar el flujo de producción.','APPROVED',v_now,40,250,array['DEMO'])
    returning id into v_work_order;
  end if;

  if not exists (select 1 from public.work_order_items where work_order_id=v_work_order and description='Camisas personalizadas') then
    insert into public.work_order_items(work_order_id,product_id,description,quantity,unit,unit_price,line_total,specifications,sort_order)
    values(v_work_order,v_camisa,'Camisas personalizadas',20,'unidad',12.5,250,'Diseño promocional ficticio para demostración.',1);
  end if;

  update public.companies
  set demo_seeded_at=now(), updated_at=now()
  where id=p_company_id;

  return jsonb_build_object(
    'company_id',p_company_id,
    'seeded_at',now(),
    'clients',3,
    'products',4,
    'quotes',2,
    'work_orders',1
  );
end;
$$;

revoke all on function public.seed_agency_demo_data(uuid,uuid) from public;
revoke all on function public.seed_agency_demo_data(uuid,uuid) from anon;
revoke all on function public.seed_agency_demo_data(uuid,uuid) from authenticated;
grant execute on function public.seed_agency_demo_data(uuid,uuid) to service_role;
