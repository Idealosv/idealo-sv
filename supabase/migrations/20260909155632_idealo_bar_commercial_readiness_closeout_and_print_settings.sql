alter table public.bar_settings add column if not exists receipt_paper_width integer not null default 80;
alter table public.bar_settings add column if not exists auto_print_kitchen boolean not null default true;
alter table public.bar_settings add column if not exists auto_print_bar boolean not null default true;
alter table public.bar_settings add column if not exists commercial_ready_at timestamptz;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='bar_settings_receipt_paper_width_check') then
  alter table public.bar_settings add constraint bar_settings_receipt_paper_width_check check(receipt_paper_width in (58,80));
 end if;
end $$;

create or replace function public.bar_bootstrap_business(p_company_id uuid,p_table_count integer default 12)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_wh uuid; v_cash uuid; v_tables int; v_locations int;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.manage') and not public.erp_can_admin(p_company_id) then raise exception 'Solo Propietario o Gerente puede preparar la estructura inicial del bar.'; end if;
 if p_table_count<1 or p_table_count>50 then raise exception 'Cantidad de mesas inválida.'; end if;
 if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'Empresa no encontrada.'; end if;

 insert into public.bar_settings(company_id,business_name)
 select p_company_id,coalesce(nullif(c.trade_name,''),nullif(c.name,''),'IDEALO BAR') from public.companies c where c.id=p_company_id
 on conflict(company_id) do nothing;

 insert into public.inventory_warehouses(company_id,code,name,warehouse_type,notes,active)
 values(p_company_id,'BAR-BOD','Bodega del bar','GENERAL','Bodega principal creada por Puesta en marcha de IDEALO BAR.',true)
 on conflict(company_id,code) do update set name=excluded.name,active=true,updated_at=now()
 returning id into v_wh;

 insert into public.inventory_locations(company_id,warehouse_id,code,zone,status,active)
 values
  (p_company_id,v_wh,'BODEGA','Bodega','AVAILABLE',true),
  (p_company_id,v_wh,'REFRIG','Refrigerador','AVAILABLE',true),
  (p_company_id,v_wh,'BARRA','Barra','AVAILABLE',true)
 on conflict(warehouse_id,code) do update set zone=excluded.zone,status='AVAILABLE',active=true,updated_at=now();

 if not exists(select 1 from public.bar_tables where company_id=p_company_id and active=true) then
  insert into public.bar_tables(company_id,name,area,capacity,status,sort_order,active)
  select p_company_id,'Mesa '||g::text,'Salón',4,'available',g,true from generate_series(1,p_table_count) g
  on conflict(company_id,name) do nothing;
 end if;

 select id into v_cash from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)<>'BANK' order by created_at limit 1;
 if v_cash is null then
  insert into public.cash_accounts(company_id,name,account_type,opening_balance,active) values(p_company_id,'Caja IDEALO BAR','CASH',0,true) returning id into v_cash;
 end if;

 select count(*) into v_tables from public.bar_tables where company_id=p_company_id and active=true;
 select count(*) into v_locations from public.inventory_locations where company_id=p_company_id and warehouse_id=v_wh and active=true;
 return jsonb_build_object('warehouse_id',v_wh,'cash_account_id',v_cash,'tables',v_tables,'locations',v_locations,'products_created',0,'message','Base operativa creada sin importar productos de otros negocios.');
end;$$;

create or replace function public.bar_commercial_readiness(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare
 v_company public.companies%rowtype; v_settings public.bar_settings%rowtype;
 v_tables int;v_menu int;v_staff int;v_cash int;v_wh int;v_loc int;v_recipes int;v_printers boolean;v_fiscal boolean;v_dte_prod boolean;
 v_required_ok int;v_required_total int:=8;v_ready boolean;v_roles jsonb;v_checks jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.erp_can_read(p_company_id) and not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Sin acceso a la puesta en marcha del bar.'; end if;
 select * into v_company from public.companies where id=p_company_id; if not found then raise exception 'Empresa no encontrada.'; end if;
 select * into v_settings from public.bar_settings where company_id=p_company_id;
 select count(*) into v_tables from public.bar_tables where company_id=p_company_id and active=true;
 select count(*) into v_menu from public.bar_menu_items where company_id=p_company_id and active=true;
 select count(*) into v_staff from public.bar_staff_assignments where company_id=p_company_id and active=true;
 select count(*) into v_cash from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)<>'BANK';
 select count(*) into v_wh from public.inventory_warehouses where company_id=p_company_id and active=true;
 select count(*) into v_loc from public.inventory_locations where company_id=p_company_id and active=true;
 select count(*) into v_recipes from public.bar_recipe_components where company_id=p_company_id and active=true;
 select coalesce(jsonb_object_agg(bar_role,n),'{}'::jsonb) into v_roles from (select bar_role,count(*) n from public.bar_staff_assignments where company_id=p_company_id and active=true group by bar_role)x;
 v_printers:=coalesce(nullif(trim(v_settings.kitchen_printer_name),'') is not null and nullif(trim(v_settings.bar_printer_name),'') is not null,false);
 v_fiscal:=nullif(trim(coalesce(v_company.nit,'')),'') is not null and nullif(trim(coalesce(v_company.nrc,'')),'') is not null and nullif(trim(coalesce(v_company.activity_code,'')),'') is not null and nullif(trim(coalesce(v_company.department_code,'')),'') is not null and nullif(trim(coalesce(v_company.municipality_code,'')),'') is not null and nullif(trim(coalesce(v_company.address,'')),'') is not null;
 v_dte_prod:=exists(select 1 from public.dte_runtime_settings r where r.company_id=p_company_id and r.environment='production' and r.production_enabled=true and r.production_approved=true);
 v_required_ok:=(case when v_settings.company_id is not null then 1 else 0 end)+(case when v_staff>0 then 1 else 0 end)+(case when v_cash>0 then 1 else 0 end)+(case when v_tables>0 then 1 else 0 end)+(case when v_menu>0 then 1 else 0 end)+(case when v_wh>0 and v_loc>=3 then 1 else 0 end)+(case when v_recipes>0 then 1 else 0 end)+(case when v_fiscal then 1 else 0 end);
 v_ready:=v_required_ok=v_required_total;
 v_checks:=jsonb_build_array(
  jsonb_build_object('id','settings','label','Configuración del negocio','required',true,'ok',v_settings.company_id is not null,'detail',case when v_settings.company_id is null then 'Ejecuta Preparar base inicial.' else coalesce(v_settings.business_name,'IDEALO BAR') end),
  jsonb_build_object('id','staff','label','Personal y permisos','required',true,'ok',v_staff>0,'detail',v_staff||' usuario(s) activo(s)'),
  jsonb_build_object('id','cash','label','Caja operativa','required',true,'ok',v_cash>0,'detail',v_cash||' cuenta(s) de caja'),
  jsonb_build_object('id','tables','label','Mesas / salón','required',true,'ok',v_tables>0,'detail',v_tables||' mesa(s)'),
  jsonb_build_object('id','menu','label','Carta real del bar','required',true,'ok',v_menu>0,'detail',v_menu||' producto(s) activo(s); no se importan productos de publicidad'),
  jsonb_build_object('id','locations','label','Bodega · Refrigerador · Barra','required',true,'ok',v_wh>0 and v_loc>=3,'detail',v_wh||' bodega(s), '||v_loc||' ubicación(es)'),
  jsonb_build_object('id','recipes','label','Recetas / consumo de inventario','required',true,'ok',v_recipes>0,'detail',v_recipes||' componente(s) activo(s)'),
  jsonb_build_object('id','fiscal','label','Perfil fiscal de la empresa','required',true,'ok',v_fiscal,'detail',case when v_fiscal then 'Datos fiscales básicos completos' else 'Completa NIT, NRC, actividad y dirección' end),
  jsonb_build_object('id','printers','label','Impresoras Cocina y Barra','required',false,'ok',v_printers,'detail',case when v_printers then 'Nombres de impresora configurados' else 'Opcional: configura impresoras térmicas 58/80 mm' end),
  jsonb_build_object('id','dte_production','label','DTE PRODUCCIÓN aprobado','required',false,'ok',v_dte_prod,'detail',case when v_dte_prod then 'Producción habilitada y aprobada' else 'TEST puede usarse; PRODUCCIÓN sigue protegida por preflight' end)
 );
 return jsonb_build_object('ready_for_sales',v_ready,'score',round((v_required_ok::numeric/v_required_total)*100,0),'required_ok',v_required_ok,'required_total',v_required_total,'ready_for_fiscal_production',v_fiscal and v_dte_prod,'checks',v_checks,'role_counts',v_roles,'commercial_ready_at',v_settings.commercial_ready_at,'paper_width',coalesce(v_settings.receipt_paper_width,80));
end;$$;

create or replace function public.bar_mark_commercial_ready(p_company_id uuid)
returns timestamptz language plpgsql security invoker set search_path=public as $$
declare v jsonb;v_now timestamptz;
begin
 if not public.bar_has_permission(p_company_id,'admin.manage') and not public.erp_can_admin(p_company_id) then raise exception 'Solo Propietario o Gerente puede finalizar la puesta en marcha.'; end if;
 v:=public.bar_commercial_readiness(p_company_id);
 if not coalesce((v->>'ready_for_sales')::boolean,false) then raise exception 'La puesta en marcha aún tiene requisitos obligatorios pendientes.'; end if;
 v_now:=now();update public.bar_settings set commercial_ready_at=v_now,updated_by=auth.uid(),updated_at=now() where company_id=p_company_id;return v_now;
end;$$;

create or replace function public.bar_daily_close_report(p_company_id uuid,p_business_date date default current_date)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v_dashboard jsonb;v_sessions jsonb;v_open int;v_result jsonb;
begin
 if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso al cierre gerencial.'; end if;
 v_dashboard:=public.bar_management_dashboard(p_company_id,p_business_date,p_business_date);
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'cash_account_id',s.cash_account_id,'opening_balance',s.opening_balance,'opened_at',s.opened_at,'closing_expected',s.closing_expected,'closing_counted',s.closing_counted,'difference',s.difference,'closed_at',s.closed_at) order by s.opened_at),'[]'::jsonb),count(*) filter(where upper(s.status)='OPEN') into v_sessions,v_open from public.cash_register_sessions s where s.company_id=p_company_id and s.business_date=p_business_date;
 v_result:=jsonb_build_object('business_date',p_business_date,'dashboard',v_dashboard,'cash_sessions',v_sessions,'open_cash_sessions',v_open,'close_ready',v_open=0 and coalesce((v_dashboard->>'open_tables')::int,0)=0 and coalesce((v_dashboard->>'pending_cash_postings')::int,0)=0,'blocking',jsonb_build_object('open_cash_sessions',v_open,'open_tables',coalesce((v_dashboard->>'open_tables')::int,0),'pending_cash_postings',coalesce((v_dashboard->>'pending_cash_postings')::int,0),'pending_dte',coalesce((v_dashboard->>'pending_dte')::int,0)));
 return v_result;
end;$$;

revoke execute on function public.bar_bootstrap_business(uuid,integer) from public,anon;
revoke execute on function public.bar_commercial_readiness(uuid) from public,anon;
revoke execute on function public.bar_mark_commercial_ready(uuid) from public,anon;
revoke execute on function public.bar_daily_close_report(uuid,date) from public,anon;
grant execute on function public.bar_bootstrap_business(uuid,integer) to authenticated;
grant execute on function public.bar_commercial_readiness(uuid) to authenticated;
grant execute on function public.bar_mark_commercial_ready(uuid) to authenticated;
grant execute on function public.bar_daily_close_report(uuid,date) to authenticated;