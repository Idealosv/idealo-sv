-- IDEALO Eggs: auditoría comercial, demo profesional y controles de integridad.

create table if not exists public.egg_audit_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score integer not null check(score between 0 and 100),
  status text not null check(status in ('PASS','WARNING','FAIL')),
  findings jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.egg_audit_runs enable row level security;
drop policy if exists egg_audit_select on public.egg_audit_runs;
drop policy if exists egg_audit_insert on public.egg_audit_runs;
create policy egg_audit_select on public.egg_audit_runs
for select to authenticated using (public.egg_company_member(company_id));
create policy egg_audit_insert on public.egg_audit_runs
for insert to authenticated with check (public.egg_can(company_id,'reports.read'));
grant select,insert on public.egg_audit_runs to authenticated;
grant all privileges on public.egg_audit_runs to service_role;

create or replace function public.egg_run_audit(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_findings jsonb:='[]'::jsonb;
  v_metrics jsonb:='{}'::jsonb;
  v_score integer:=100;
  v_count integer;
  v_status text;
  v_result jsonb;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;

  select count(*) into v_count from public.egg_inventory_stock where company_id=p_company_id and stock_eggs<0;
  v_metrics:=v_metrics||jsonb_build_object('negative_stock',v_count);
  if v_count>0 then
    v_score:=v_score-25;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','CRITICAL','code','NEGATIVE_STOCK','message',v_count||' clasificaciones tienen inventario negativo.'));
  end if;

  select count(*) into v_count
  from public.egg_batches b
  left join lateral (
    select coalesce(sum(c.quantity_eggs+c.damaged_eggs),0) as classified
    from public.egg_batch_classifications c where c.batch_id=b.id
  ) x on true
  where b.company_id=p_company_id and x.classified>b.total_eggs;
  v_metrics:=v_metrics||jsonb_build_object('overclassified_batches',v_count);
  if v_count>0 then
    v_score:=v_score-25;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','CRITICAL','code','BATCH_OVERCLASSIFIED','message',v_count||' lotes superan la cantidad recibida.'));
  end if;

  select count(*) into v_count
  from public.egg_orders o
  left join lateral (
    select coalesce(sum(i.line_total),0) as item_total
    from public.egg_order_items i where i.order_id=o.id
  ) x on true
  where o.company_id=p_company_id and o.status<>'CANCELLED' and abs(coalesce(o.total,0)-coalesce(x.item_total,0))>0.01;
  v_metrics:=v_metrics||jsonb_build_object('order_total_mismatch',v_count);
  if v_count>0 then
    v_score:=v_score-15;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','HIGH','code','ORDER_TOTAL_MISMATCH','message',v_count||' pedidos tienen diferencias entre encabezado y líneas.'));
  end if;

  select count(*) into v_count
  from public.egg_orders o
  left join lateral (
    select coalesce(sum(p.amount),0) as payments
    from public.egg_payments p where p.order_id=o.id
  ) x on true
  where o.company_id=p_company_id and abs(coalesce(o.paid_amount,0)-coalesce(x.payments,0))>0.01;
  v_metrics:=v_metrics||jsonb_build_object('payment_mismatch',v_count);
  if v_count>0 then
    v_score:=v_score-15;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','HIGH','code','PAYMENT_MISMATCH','message',v_count||' pedidos no coinciden con la suma de cobros.'));
  end if;

  select count(*) into v_count
  from public.egg_orders
  where company_id=p_company_id and paid_amount>total+0.01;
  v_metrics:=v_metrics||jsonb_build_object('overpaid_orders',v_count);
  if v_count>0 then
    v_score:=v_score-10;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','HIGH','code','OVERPAID_ORDER','message',v_count||' pedidos tienen pagos por encima del total.'));
  end if;

  select count(*) into v_count
  from (
    select order_id,count(*) from public.egg_route_stops
    where company_id=p_company_id and status in ('PENDING','DELIVERED')
    group by order_id having count(*)>1
  ) q;
  v_metrics:=v_metrics||jsonb_build_object('duplicate_active_route_orders',v_count);
  if v_count>0 then
    v_score:=v_score-10;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','MEDIUM','code','DUPLICATE_ROUTE_ORDER','message',v_count||' pedidos aparecen en más de una ruta activa.'));
  end if;

  select count(*) into v_count
  from public.egg_orders o
  where o.company_id=p_company_id and o.status='CONFIRMED' and o.due_date<current_date and o.total>o.paid_amount;
  v_metrics:=v_metrics||jsonb_build_object('overdue_orders',v_count);
  if v_count>0 then
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','INFO','code','OVERDUE_RECEIVABLES','message',v_count||' pedidos a crédito están vencidos.'));
  end if;

  select count(*) into v_count
  from public.egg_batches b
  where b.company_id=p_company_id and b.status='OPEN' and b.received_at<current_date-interval '3 days';
  v_metrics:=v_metrics||jsonb_build_object('stale_open_batches',v_count);
  if v_count>0 then
    v_score:=v_score-5;
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','LOW','code','STALE_OPEN_BATCH','message',v_count||' lotes llevan más de 3 días abiertos.'));
  end if;

  select count(*) into v_count
  from public.egg_grades g
  where g.company_id=p_company_id and g.active=true
    and not exists (
      select 1 from public.egg_price_rules r
      where r.company_id=p_company_id and r.grade_id=g.id and r.active=true and r.customer_id is null
    );
  v_metrics:=v_metrics||jsonb_build_object('grades_without_general_price',v_count);
  if v_count>0 then
    v_findings:=v_findings||jsonb_build_array(jsonb_build_object('severity','INFO','code','MISSING_GENERAL_PRICE','message',v_count||' clasificaciones activas no tienen precio general.'));
  end if;

  v_score:=greatest(0,least(100,v_score));
  v_status:=case when v_score>=90 then 'PASS' when v_score>=70 then 'WARNING' else 'FAIL' end;
  v_result:=jsonb_build_object(
    'company_id',p_company_id,
    'score',v_score,
    'status',v_status,
    'findings',v_findings,
    'metrics',v_metrics,
    'generated_at',now()
  );

  insert into public.egg_audit_runs(company_id,score,status,findings,metrics,created_by)
  values(p_company_id,v_score,v_status,v_findings,v_metrics,auth.uid());

  return v_result;
end;
$$;

grant execute on function public.egg_run_audit(uuid) to authenticated,service_role;

create or replace function public.egg_seed_commercial_demo(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_demo boolean;
  v_actor uuid:=auth.uid();
  v_supplier_a uuid;
  v_supplier_b uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_customer_c uuid;
  v_grade_l uuid;
  v_grade_m uuid;
  v_grade_xl uuid;
  v_batch_a uuid;
  v_batch_b uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_order_c uuid;
  v_route uuid;
  v_count integer:=0;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if public.egg_effective_role(p_company_id) not in ('OWNER','MANAGER') then raise exception 'Solo propietario o gerente puede cargar la demo profesional.'; end if;
  select demo_mode into v_demo from public.companies where id=p_company_id;
  if coalesce(v_demo,false)=false then raise exception 'La demo profesional solo puede cargarse en empresas DEMO/desarrollo.'; end if;

  perform public.egg_seed_default_grades(p_company_id);
  select id into v_grade_l from public.egg_grades where company_id=p_company_id and code='L';
  select id into v_grade_m from public.egg_grades where company_id=p_company_id and code='M';
  select id into v_grade_xl from public.egg_grades where company_id=p_company_id and code='XL';

  insert into public.egg_suppliers(company_id,name,contact_name,phone,email,notes,created_by)
  values(p_company_id,'DEMO · Granja El Roble','Carlos Méndez','7000-1101','granja.roble@demo.local','Proveedor demo IDEALO Eggs',v_actor)
  on conflict(company_id,name) do update set active=true
  returning id into v_supplier_a;
  if v_supplier_a is null then select id into v_supplier_a from public.egg_suppliers where company_id=p_company_id and name='DEMO · Granja El Roble'; end if;

  insert into public.egg_suppliers(company_id,name,contact_name,phone,email,notes,created_by)
  values(p_company_id,'DEMO · Avícola La Campiña','María López','7000-1102','campina@demo.local','Proveedor demo IDEALO Eggs',v_actor)
  on conflict(company_id,name) do update set active=true
  returning id into v_supplier_b;
  if v_supplier_b is null then select id into v_supplier_b from public.egg_suppliers where company_id=p_company_id and name='DEMO · Avícola La Campiña'; end if;

  select id into v_customer_a from public.egg_customers where company_id=p_company_id and name='DEMO · Súper Mercado Central' limit 1;
  if v_customer_a is null then
    insert into public.egg_customers(company_id,name,contact_name,phone,email,address,credit_limit,credit_days,notes,created_by)
    values(p_company_id,'DEMO · Súper Mercado Central','Ana Rivera','7000-2101','compras.super@demo.local','Centro de Ahuachapán',1200,15,'Cliente demo mayorista',v_actor)
    returning id into v_customer_a;
  end if;

  select id into v_customer_b from public.egg_customers where company_id=p_company_id and name='DEMO · Panadería San José' limit 1;
  if v_customer_b is null then
    insert into public.egg_customers(company_id,name,contact_name,phone,email,address,credit_limit,credit_days,notes,created_by)
    values(p_company_id,'DEMO · Panadería San José','José Pérez','7000-2102','compras.panaderia@demo.local','Barrio El Centro, Ahuachapán',600,8,'Cliente demo panadería',v_actor)
    returning id into v_customer_b;
  end if;

  select id into v_customer_c from public.egg_customers where company_id=p_company_id and name='DEMO · Restaurante El Portal' limit 1;
  if v_customer_c is null then
    insert into public.egg_customers(company_id,name,contact_name,phone,email,address,credit_limit,credit_days,notes,created_by)
    values(p_company_id,'DEMO · Restaurante El Portal','Lucía Hernández','7000-2103','compras.portal@demo.local','Ahuachapán',350,0,'Cliente demo contado',v_actor)
    returning id into v_customer_c;
  end if;

  if not exists(select 1 from public.egg_price_rules where company_id=p_company_id and notes='DEMO_COMERCIAL_EGGS') then
    insert into public.egg_price_rules(company_id,grade_id,presentation,eggs_per_unit,min_units,max_units,unit_price,notes,created_by)
    values
      (p_company_id,v_grade_xl,'Bandeja',30,1,20,5.35,'DEMO_COMERCIAL_EGGS',v_actor),
      (p_company_id,v_grade_xl,'Bandeja',30,21,null,5.10,'DEMO_COMERCIAL_EGGS',v_actor),
      (p_company_id,v_grade_l,'Bandeja',30,1,20,4.85,'DEMO_COMERCIAL_EGGS',v_actor),
      (p_company_id,v_grade_l,'Bandeja',30,21,null,4.60,'DEMO_COMERCIAL_EGGS',v_actor),
      (p_company_id,v_grade_m,'Bandeja',30,1,20,4.35,'DEMO_COMERCIAL_EGGS',v_actor),
      (p_company_id,v_grade_m,'Bandeja',30,21,null,4.10,'DEMO_COMERCIAL_EGGS',v_actor);
  end if;

  select id into v_batch_a from public.egg_batches where company_id=p_company_id and batch_code='DEMO-LOT-001';
  if v_batch_a is null then
    insert into public.egg_batches(company_id,supplier_id,batch_code,received_at,total_eggs,total_cost,source_reference,status,notes,created_by)
    values(p_company_id,v_supplier_a,'DEMO-LOT-001',current_date-2,9000,990,'DEMO-COMPRA-001','CLASSIFIED','DEMO_COMERCIAL_EGGS',v_actor)
    returning id into v_batch_a;
    insert into public.egg_batch_classifications(company_id,batch_id,grade_id,quantity_eggs,damaged_eggs,avg_weight_g,created_by)
    values
      (p_company_id,v_batch_a,v_grade_xl,2400,60,67.10,v_actor),
      (p_company_id,v_batch_a,v_grade_l,3600,80,62.20,v_actor),
      (p_company_id,v_batch_a,v_grade_m,2780,80,57.30,v_actor);
    insert into public.egg_inventory_movements(company_id,grade_id,batch_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values
      (p_company_id,v_grade_xl,v_batch_a,'RECEIPT',2400,0.11,'DEMO · clasificación',v_actor),
      (p_company_id,v_grade_l,v_batch_a,'RECEIPT',3600,0.11,'DEMO · clasificación',v_actor),
      (p_company_id,v_grade_m,v_batch_a,'RECEIPT',2780,0.11,'DEMO · clasificación',v_actor);
  end if;

  select id into v_batch_b from public.egg_batches where company_id=p_company_id and batch_code='DEMO-LOT-002';
  if v_batch_b is null then
    insert into public.egg_batches(company_id,supplier_id,batch_code,received_at,total_eggs,total_cost,source_reference,status,notes,created_by)
    values(p_company_id,v_supplier_b,'DEMO-LOT-002',current_date-1,6000,690,'DEMO-COMPRA-002','CLASSIFIED','DEMO_COMERCIAL_EGGS',v_actor)
    returning id into v_batch_b;
    insert into public.egg_batch_classifications(company_id,batch_id,grade_id,quantity_eggs,damaged_eggs,avg_weight_g,created_by)
    values
      (p_company_id,v_batch_b,v_grade_xl,1650,40,66.80,v_actor),
      (p_company_id,v_batch_b,v_grade_l,2450,50,61.90,v_actor),
      (p_company_id,v_batch_b,v_grade_m,1760,50,56.90,v_actor);
    insert into public.egg_inventory_movements(company_id,grade_id,batch_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values
      (p_company_id,v_grade_xl,v_batch_b,'RECEIPT',1650,0.115,'DEMO · clasificación',v_actor),
      (p_company_id,v_grade_l,v_batch_b,'RECEIPT',2450,0.115,'DEMO · clasificación',v_actor),
      (p_company_id,v_grade_m,v_batch_b,'RECEIPT',1760,0.115,'DEMO · clasificación',v_actor);
  end if;

  if not exists(select 1 from public.egg_orders where company_id=p_company_id and notes='DEMO_COMERCIAL_EGGS') then
    v_order_a:=public.egg_create_order(p_company_id,v_customer_a,v_grade_l,'Bandeja',20,30,4.60,'CREDIT','DEMO_COMERCIAL_EGGS');
    v_order_b:=public.egg_create_order(p_company_id,v_customer_b,v_grade_m,'Bandeja',12,30,4.35,'CREDIT','DEMO_COMERCIAL_EGGS');
    v_order_c:=public.egg_create_order(p_company_id,v_customer_c,v_grade_xl,'Bandeja',8,30,5.35,'CASH','DEMO_COMERCIAL_EGGS');
    perform public.egg_record_payment(v_order_a,45,'TRANSFER','DEMO-ABONO-001');

    v_route:=public.egg_create_route(p_company_id,current_date,'DEMO · Ruta Centro','Mario Gómez','P-123456','DEMO_COMERCIAL_EGGS');
    perform public.egg_add_order_to_route(v_route,v_order_a);
    perform public.egg_add_order_to_route(v_route,v_order_b);
    perform public.egg_prepare_route_load(v_route);
  end if;

  select count(*) into v_count from public.egg_orders where company_id=p_company_id and notes='DEMO_COMERCIAL_EGGS';

  return jsonb_build_object(
    'ok',true,
    'suppliers',2,
    'customers',3,
    'demo_orders',v_count,
    'inventory_eggs',(select coalesce(sum(stock_eggs),0) from public.egg_inventory_stock where company_id=p_company_id),
    'message','Demo comercial IDEALO Eggs cargada correctamente.'
  );
end;
$$;

grant execute on function public.egg_seed_commercial_demo(uuid) to authenticated,service_role;

create or replace view public.egg_executive_dashboard
with (security_invoker=true)
as
select
  c.id as company_id,
  coalesce(inv.stock_eggs,0) as stock_eggs,
  coalesce(inv.stock_value,0) as stock_value,
  coalesce(sales.sales_total,0) as sales_total,
  coalesce(sales.cost_total,0) as cost_total,
  coalesce(sales.profit_total,0) as profit_total,
  case when coalesce(sales.sales_total,0)>0 then round(sales.profit_total/sales.sales_total*100,2) else 0 end as margin_percent,
  coalesce(ar.balance,0) as receivable_balance,
  coalesce(ar.overdue_balance,0) as overdue_balance,
  coalesce(loss.loss_eggs,0) as loss_eggs,
  coalesce(loss.loss_cost,0) as loss_cost,
  coalesce(route.pending_stops,0) as pending_stops,
  coalesce(route.delivered_stops,0) as delivered_stops,
  coalesce(route.collected,0) as route_collected,
  coalesce(batch.received_30d,0) as eggs_received_30d,
  best_customer.customer_name as best_customer,
  best_customer.customer_sales as best_customer_sales,
  best_grade.grade_name as best_grade,
  best_grade.grade_sales as best_grade_sales
from public.companies c
left join lateral (
  select sum(s.stock_eggs) as stock_eggs,sum(s.stock_eggs*s.avg_cost_per_egg) as stock_value
  from public.egg_inventory_stock s where s.company_id=c.id
) inv on true
left join lateral (
  select sum(r.line_total) as sales_total,sum(r.cost_total) as cost_total,sum(r.profit_amount) as profit_total
  from public.egg_sales_profitability_report r where r.company_id=c.id
) sales on true
left join lateral (
  select sum(balance) as balance,
         sum(case when oldest_overdue_date is not null then balance else 0 end) as overdue_balance
  from public.egg_customer_balance_report r where r.company_id=c.id
) ar on true
left join lateral (
  select sum(eggs_lost) as loss_eggs,sum(estimated_cost) as loss_cost
  from public.egg_loss_summary_report r where r.company_id=c.id
) loss on true
left join lateral (
  select
    sum(stops-delivered-failed) as pending_stops,
    sum(delivered) as delivered_stops,
    sum(collected_amount) as collected
  from public.egg_route_performance_report r where r.company_id=c.id
) route on true
left join lateral (
  select sum(total_eggs) as received_30d from public.egg_batches b
  where b.company_id=c.id and b.received_at>=current_date-30
) batch on true
left join lateral (
  select customer_name,sum(line_total) as customer_sales
  from public.egg_sales_profitability_report r
  where r.company_id=c.id
  group by customer_name order by customer_sales desc limit 1
) best_customer on true
left join lateral (
  select grade_name,sum(line_total) as grade_sales
  from public.egg_sales_profitability_report r
  where r.company_id=c.id
  group by grade_name order by grade_sales desc limit 1
) best_grade on true;

grant select on public.egg_executive_dashboard to authenticated,service_role;
