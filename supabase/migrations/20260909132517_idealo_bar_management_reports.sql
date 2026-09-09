create or replace function public.bar_management_dashboard(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_from timestamptz; v_to timestamptz; v_revenue numeric; v_cogs numeric; v_courtesy numeric; v_waste numeric; v_internal numeric; v_result jsonb;
begin
  if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso al tablero gerencial del bar.'; end if;
  if p_to<p_from then raise exception 'Rango de fechas inválido.'; end if;
  v_from=(p_from::timestamp at time zone 'America/El_Salvador');
  v_to=((p_to+1)::timestamp at time zone 'America/El_Salvador');
  select coalesce(sum(greatest(o.subtotal-o.discount_total,0)),0) into v_revenue from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to;
  select coalesce(sum(c.quantity*c.unit_cost),0) into v_cogs from public.bar_inventory_consumptions c join public.bar_orders o on o.id=c.order_id where c.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to;
  select coalesce(sum(estimated_cost),0) into v_courtesy from public.bar_inventory_events where company_id=p_company_id and event_type='COURTESY' and created_at>=v_from and created_at<v_to;
  select coalesce(sum(estimated_cost),0) into v_waste from public.bar_inventory_events where company_id=p_company_id and event_type in ('WASTE','DAMAGE') and created_at>=v_from and created_at<v_to;
  select coalesce(sum(estimated_cost),0) into v_internal from public.bar_inventory_events where company_id=p_company_id and event_type='INTERNAL' and created_at>=v_from and created_at<v_to;
  select jsonb_build_object(
    'revenue',v_revenue,
    'collections',coalesce((select sum(amount) from public.bar_payments where company_id=p_company_id and created_at>=v_from and created_at<v_to),0),
    'orders',coalesce((select count(*) from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to),0),
    'average_ticket',coalesce((select avg(greatest(subtotal-discount_total,0)) from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to),0),
    'tips',coalesce((select sum(tip_total) from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to),0),
    'manual_discounts',coalesce((select sum(discount_total) from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to),0),
    'promotion_discounts',coalesce((select sum(i.promotion_discount*i.quantity) from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
    'cogs',v_cogs,
    'gross_profit',v_revenue-v_cogs,
    'gross_margin_percent',case when v_revenue>0 then round(((v_revenue-v_cogs)/v_revenue*100)::numeric,2) else 0 end,
    'courtesy_cost',v_courtesy,
    'waste_cost',v_waste,
    'internal_cost',v_internal,
    'controlled_loss_cost',v_courtesy+v_waste+v_internal,
    'contribution_after_losses',v_revenue-v_cogs-v_courtesy-v_waste-v_internal,
    'cash',coalesce((select sum(amount) from public.bar_payments where company_id=p_company_id and method='cash' and created_at>=v_from and created_at<v_to),0),
    'card',coalesce((select sum(amount) from public.bar_payments where company_id=p_company_id and method='card' and created_at>=v_from and created_at<v_to),0),
    'transfer',coalesce((select sum(amount) from public.bar_payments where company_id=p_company_id and method='transfer' and created_at>=v_from and created_at<v_to),0),
    'other',coalesce((select sum(amount) from public.bar_payments where company_id=p_company_id and method not in ('cash','card','transfer') and created_at>=v_from and created_at<v_to),0),
    'voided_items',coalesce((select count(*) from public.bar_order_items where company_id=p_company_id and status='cancelled' and voided_at>=v_from and voided_at<v_to),0),
    'cancelled_orders',coalesce((select count(*) from public.bar_orders where company_id=p_company_id and status='cancelled' and updated_at>=v_from and updated_at<v_to),0),
    'pending_dte',coalesce((select count(*) from public.bar_dte_requests where company_id=p_company_id and status='PENDING'),0),
    'pending_cash_postings',coalesce((select count(*) from public.bar_payments where company_id=p_company_id and financial_posting_status<>'posted'),0),
    'open_tables',coalesce((select count(*) from public.bar_tables where company_id=p_company_id and active=true and status in ('occupied','awaiting_payment','reserved')),0),
    'low_stock_items',coalesce((select count(*) from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null and exists(select 1 from public.bar_recipe_components r where r.company_id=p_company_id and r.inventory_item_id=i.id and r.active=true) and greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0))),0),
    'top_product',coalesce((select jsonb_build_object('name',x.item_name,'quantity',x.qty,'sales',x.sales) from (select i.item_name,sum(i.quantity) qty,sum(i.line_total) sales from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to group by i.item_name order by sum(i.quantity) desc,sum(i.line_total) desc limit 1)x),'{}'::jsonb),
    'top_waiter',coalesce((select jsonb_build_object('user_id',x.waiter_id,'name',coalesce(s.display_name,'Sin asignar'),'orders',x.orders,'sales',x.sales) from (select waiter_id,count(*) orders,sum(greatest(subtotal-discount_total,0)) sales from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by waiter_id order by sales desc nulls last limit 1)x left join public.bar_staff_assignments s on s.company_id=p_company_id and s.user_id=x.waiter_id),'{}'::jsonb),
    'busiest_hour',coalesce((select jsonb_build_object('hour',x.hour_value,'orders',x.orders,'sales',x.sales) from (select extract(hour from closed_at at time zone 'America/El_Salvador')::int hour_value,count(*) orders,sum(greatest(subtotal-discount_total,0)) sales from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by 1 order by orders desc,sales desc limit 1)x),'{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.bar_product_profitability(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns table(product_id uuid,product_name text,category text,sold_quantity numeric,net_sales numeric,average_sale_price numeric,standard_unit_cost numeric,actual_cost numeric,gross_profit numeric,margin_percent numeric)
language plpgsql
security invoker
set search_path=public
as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso al análisis de rentabilidad.'; end if;
  if p_to<p_from then raise exception 'Rango de fechas inválido.'; end if;
  v_from=(p_from::timestamp at time zone 'America/El_Salvador'); v_to=((p_to+1)::timestamp at time zone 'America/El_Salvador');
  return query
  with sales as (
    select i.product_id,max(i.item_name) product_name,max(coalesce(m.category,'Sin categoría')) category,
           sum(i.quantity) sold_quantity,
           sum(case when o.subtotal>0 then i.line_total-(o.discount_total*(i.line_total/o.subtotal)) else i.line_total end) net_sales
    from public.bar_order_items i
    join public.bar_orders o on o.id=i.order_id
    left join public.bar_menu_items m on m.id=i.menu_item_id
    where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to
    group by i.product_id
  ), standard_cost as (
    select r.product_id,sum(r.quantity_per_unit*(1+coalesce(r.waste_percent,0)/100)*coalesce(ii.average_cost,0)) unit_cost
    from public.bar_recipe_components r join public.inventory_items ii on ii.id=r.inventory_item_id and ii.company_id=r.company_id
    where r.company_id=p_company_id and r.active=true and ii.active=true and ii.deleted_at is null group by r.product_id
  ), actual as (
    select i.product_id,sum(c.quantity*c.unit_cost) actual_cost
    from public.bar_inventory_consumptions c join public.bar_order_items i on i.id=c.order_item_id join public.bar_orders o on o.id=c.order_id
    where c.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to group by i.product_id
  )
  select s.product_id,s.product_name,s.category,s.sold_quantity,round(s.net_sales,2),
         round(case when s.sold_quantity>0 then s.net_sales/s.sold_quantity else 0 end,2),
         round(coalesce(sc.unit_cost,0),4),round(coalesce(a.actual_cost,0),2),
         round(s.net_sales-coalesce(a.actual_cost,0),2),
         case when s.net_sales>0 then round(((s.net_sales-coalesce(a.actual_cost,0))/s.net_sales*100)::numeric,2) else 0 end
  from sales s left join standard_cost sc on sc.product_id=s.product_id left join actual a on a.product_id=s.product_id
  order by (s.net_sales-coalesce(a.actual_cost,0)) desc,s.net_sales desc;
end;
$$;

create or replace function public.bar_staff_performance(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns table(user_id uuid,display_name text,bar_role text,orders_count bigint,net_sales numeric,average_ticket numeric,tips numeric,discounts numeric,voided_items bigint)
language plpgsql
security invoker
set search_path=public
as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso al rendimiento del personal.'; end if;
  if p_to<p_from then raise exception 'Rango de fechas inválido.'; end if;
  v_from=(p_from::timestamp at time zone 'America/El_Salvador'); v_to=((p_to+1)::timestamp at time zone 'America/El_Salvador');
  return query
  with o as (
    select waiter_id,count(*) orders_count,sum(greatest(subtotal-discount_total,0)) net_sales,avg(greatest(subtotal-discount_total,0)) average_ticket,sum(tip_total) tips,sum(discount_total) discounts
    from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by waiter_id
  ), v as (
    select voided_by,count(*) voided_items from public.bar_order_items where company_id=p_company_id and status='cancelled' and voided_at>=v_from and voided_at<v_to group by voided_by
  )
  select s.user_id,s.display_name,s.bar_role,coalesce(o.orders_count,0),round(coalesce(o.net_sales,0),2),round(coalesce(o.average_ticket,0),2),round(coalesce(o.tips,0),2),round(coalesce(o.discounts,0),2),coalesce(v.voided_items,0)
  from public.bar_staff_assignments s left join o on o.waiter_id=s.user_id left join v on v.voided_by=s.user_id
  where s.company_id=p_company_id and s.active=true
  order by coalesce(o.net_sales,0) desc,s.display_name;
end;
$$;

create or replace function public.bar_management_report(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_from timestamptz; v_to timestamptz; v_result jsonb;
begin
  if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso a reportes gerenciales.'; end if;
  if p_to<p_from then raise exception 'Rango de fechas inválido.'; end if;
  v_from=(p_from::timestamp at time zone 'America/El_Salvador'); v_to=((p_to+1)::timestamp at time zone 'America/El_Salvador');
  select jsonb_build_object(
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',x.day_value,'orders',x.orders,'sales',x.sales) order by x.day_value) from (select (closed_at at time zone 'America/El_Salvador')::date day_value,count(*) orders,sum(greatest(subtotal-discount_total,0)) sales from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by 1)x),'[]'::jsonb),
    'hourly',coalesce((select jsonb_agg(jsonb_build_object('hour',x.hour_value,'orders',x.orders,'sales',x.sales) order by x.hour_value) from (select extract(hour from closed_at at time zone 'America/El_Salvador')::int hour_value,count(*) orders,sum(greatest(subtotal-discount_total,0)) sales from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by 1)x),'[]'::jsonb),
    'payment_methods',coalesce((select jsonb_agg(jsonb_build_object('method',x.method,'amount',x.amount,'payments',x.payments) order by x.amount desc) from (select method,sum(amount) amount,count(*) payments from public.bar_payments where company_id=p_company_id and created_at>=v_from and created_at<v_to group by method)x),'[]'::jsonb),
    'order_types',coalesce((select jsonb_agg(jsonb_build_object('type',x.order_type,'orders',x.orders,'sales',x.sales) order by x.sales desc) from (select order_type,count(*) orders,sum(greatest(subtotal-discount_total,0)) sales from public.bar_orders where company_id=p_company_id and status='paid' and closed_at>=v_from and closed_at<v_to group by order_type)x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.bar_management_dashboard(uuid,date,date) from public,anon;
revoke all on function public.bar_product_profitability(uuid,date,date) from public,anon;
revoke all on function public.bar_staff_performance(uuid,date,date) from public,anon;
revoke all on function public.bar_management_report(uuid,date,date) from public,anon;
grant execute on function public.bar_management_dashboard(uuid,date,date) to authenticated,service_role;
grant execute on function public.bar_product_profitability(uuid,date,date) to authenticated,service_role;
grant execute on function public.bar_staff_performance(uuid,date,date) to authenticated,service_role;
grant execute on function public.bar_management_report(uuid,date,date) to authenticated,service_role;