-- IDEALO BAR · KPIs: ventas netas separadas de propinas y cobros

create or replace function public.bar_owner_dashboard(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare v_result jsonb;v_from timestamptz;v_to timestamptz;
begin
 if not public.bar_can_view_management(p_company_id) then raise exception 'Tu rol no tiene acceso al tablero financiero del bar.';end if;
 if p_to<p_from then raise exception 'Rango de fechas inválido.';end if;
 v_from:=(p_from::timestamp at time zone 'America/El_Salvador');v_to:=((p_to+1)::timestamp at time zone 'America/El_Salvador');
 select jsonb_build_object(
  'sales',coalesce((select sum(greatest(o.subtotal-o.discount_total,0)) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
  'collections',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.created_at>=v_from and bp.created_at<v_to),0),
  'tips',coalesce((select sum(o.tip_total) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
  'orders',coalesce((select count(*) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
  'average_ticket',coalesce((select avg(greatest(o.subtotal-o.discount_total,0)) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
  'cash',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='cash' and bp.created_at>=v_from and bp.created_at<v_to),0),
  'card',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='card' and bp.created_at>=v_from and bp.created_at<v_to),0),
  'transfer',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='transfer' and bp.created_at>=v_from and bp.created_at<v_to),0),
  'promotion_discount',coalesce((select sum(i.promotion_discount*i.quantity) from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
  'courtesy_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type='COURTESY' and e.created_at>=v_from and e.created_at<v_to),0),
  'waste_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type in ('WASTE','DAMAGE') and e.created_at>=v_from and e.created_at<v_to),0),
  'internal_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type='INTERNAL' and e.created_at>=v_from and e.created_at<v_to),0),
  'pending_cash_postings',coalesce((select count(*) from public.bar_payments bp where bp.company_id=p_company_id and bp.financial_posting_status<>'posted' and bp.created_at>=v_from and bp.created_at<v_to),0),
  'top_product',coalesce((select jsonb_build_object('name',x.item_name,'quantity',x.qty,'sales',x.amount) from (select i.item_name,sum(i.quantity) qty,sum(i.line_total) amount from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to group by i.item_name order by sum(i.quantity) desc,sum(i.line_total) desc limit 1)x),'{}'::jsonb)
 ) into v_result;return v_result;
end;$$;

create or replace function public.bar_advanced_profitability(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare v_result jsonb;
begin
 if not public.bar_can_view_management(p_company_id) then return '{}'::jsonb;end if;
 select jsonb_build_object(
  'summary',jsonb_build_object(
    'sales',coalesce(sum(greatest(o.subtotal-o.discount_total,0)),0),
    'collections',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and (bp.created_at at time zone 'America/El_Salvador')::date between p_from and p_to),0),
    'discounts',coalesce(sum(o.discount_total),0),
    'tips',coalesce(sum(o.tip_total),0),
    'orders',count(*),
    'avg_ticket',coalesce(avg(greatest(o.subtotal-o.discount_total,0)),0)
  ),
  'by_hour',(select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour_num,'sales',h.sales,'orders',h.orders) order by h.hour_num),'[]'::jsonb) from (select extract(hour from closed_at at time zone 'America/El_Salvador')::int hour_num,sum(greatest(subtotal-discount_total,0)) sales,count(*) orders from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to group by extract(hour from closed_at at time zone 'America/El_Salvador')::int)h),
  'tips_by_waiter',(select coalesce(jsonb_agg(jsonb_build_object('user_id',t.recipient_user_id,'tips',t.tips,'count',t.tip_count) order by t.tips desc),'[]'::jsonb) from (select recipient_user_id,sum(amount) tips,count(*) tip_count from public.bar_tip_allocations where company_id=p_company_id and status='EARNED' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to group by recipient_user_id)t),
  'losses',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type in ('WASTE','DAMAGE') and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to),
  'courtesies',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type='COURTESY' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to)
 ) into v_result
 from public.bar_orders o
 where o.company_id=p_company_id and o.status='paid' and (o.closed_at at time zone 'America/El_Salvador')::date between p_from and p_to;
 return coalesce(v_result,'{}'::jsonb);
end;$$;

create or replace function public.bar_shift_snapshot(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_now timestamptz:=now();v_day date:=(now() at time zone 'America/El_Salvador')::date;v_session public.cash_register_sessions%rowtype;v_open_orders int;v_station_pending int;v_pending_postings int;v_pending_dte int;v_low_stock int;v_stale_print int;v_today_sales numeric;v_today_tips numeric;v_cash numeric;v_card numeric;v_transfer numeric;v_other numeric;v_open_payload jsonb;v_res_payload jsonb;v_session_payload jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.';end if;
 if not public.bar_has_permission(p_company_id,'cash.view') and not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Tu rol no puede consultar el control de turno.';end if;
 select * into v_session from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN' order by case when opened_by=auth.uid() then 0 else 1 end,opened_at desc limit 1;
 select count(*) into v_open_orders from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled');
 select count(*) into v_station_pending from public.bar_order_items where company_id=p_company_id and status in ('sent','preparing','ready');
 select count(*) into v_pending_postings from public.bar_payments where company_id=p_company_id and financial_posting_status<>'posted';
 select count(*) into v_pending_dte from public.dte_documents where company_id=p_company_id and bar_order_id is not null and status in ('DRAFT','SIGNING','SIGNED','TRANSMITTING','TRANSMISSION_UNKNOWN','REJECTED');
 select count(*) into v_stale_print from public.bar_print_jobs where company_id=p_company_id and status='PENDING' and created_at<v_now-interval '15 minutes';
 select count(*) into v_low_stock from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null and exists(select 1 from public.bar_recipe_components r join public.bar_menu_items m on m.company_id=r.company_id and m.product_id=r.product_id and m.active=true join public.finished_products p on p.id=m.product_id and p.company_id=m.company_id and p.active=true where r.company_id=p_company_id and r.inventory_item_id=i.id and r.active=true) and greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0));
 select coalesce(sum(greatest(subtotal-discount_total,0)),0),coalesce(sum(tip_total),0) into v_today_sales,v_today_tips from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=v_day;
 select coalesce(sum(amount) filter(where method='cash'),0),coalesce(sum(amount) filter(where method='card'),0),coalesce(sum(amount) filter(where method='transfer'),0),coalesce(sum(amount) filter(where method not in ('cash','card','transfer')),0) into v_cash,v_card,v_transfer,v_other from public.bar_payments where company_id=p_company_id and (created_at at time zone 'America/El_Salvador')::date=v_day;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'order_code',o.order_code,'type',o.order_type,'status',o.status,'table_id',o.table_id,'total',o.total,'opened_at',o.opened_at,'requested_bill_at',o.requested_bill_at) order by o.opened_at),'[]'::jsonb) into v_open_payload from (select * from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled') order by opened_at limit 30)o;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'customer_name',r.customer_name,'party_size',r.party_size,'reserved_for',r.reserved_for,'table_id',r.table_id,'status',r.status) order by r.reserved_for),'[]'::jsonb) into v_res_payload from (select * from public.bar_reservations where company_id=p_company_id and status in ('pending','confirmed') and reserved_for between v_now-interval '1 hour' and v_now+interval '6 hours' order by reserved_for limit 30)r;
 if v_session.id is null then v_session_payload:=null;else v_session_payload:=jsonb_build_object('id',v_session.id,'business_date',v_session.business_date,'opening_balance',v_session.opening_balance,'opened_at',v_session.opened_at,'opened_by',v_session.opened_by,'cash_account_id',v_session.cash_account_id,'cash_collected',coalesce((select sum(p.amount) from public.bar_payments p where p.cash_register_session_id=v_session.id and p.method='cash'),0),'all_collected',coalesce((select sum(p.amount) from public.bar_payments p where p.cash_register_session_id=v_session.id),0),'manual_income',coalesce((select sum(m.amount) from public.cash_movements m where m.cash_register_session_id=v_session.id and m.movement_type='INCOME' and m.source_type='MANUAL'),0),'manual_expense',coalesce((select sum(m.amount) from public.cash_movements m where m.cash_register_session_id=v_session.id and m.movement_type='EXPENSE' and m.source_type='MANUAL'),0));end if;
 return jsonb_build_object('business_date',v_day,'checked_at',v_now,'cash_session',v_session_payload,'open_orders',v_open_orders,'station_pending',v_station_pending,'pending_cash_postings',v_pending_postings,'pending_dte',v_pending_dte,'low_stock_items',v_low_stock,'stale_print_jobs',v_stale_print,'today_sales',v_today_sales,'today_tips',v_today_tips,'payments',jsonb_build_object('cash',v_cash,'card',v_card,'transfer',v_transfer,'other',v_other,'total',v_cash+v_card+v_transfer+v_other),'open_order_list',v_open_payload,'upcoming_reservations',v_res_payload,'operational_clear',v_station_pending=0 and v_stale_print=0,'cash_close_ready',v_open_orders=0 and v_station_pending=0 and v_pending_postings=0,'needs_attention',v_pending_postings+v_pending_dte+v_low_stock+v_stale_print);
end;$$;
revoke execute on function public.bar_shift_snapshot(uuid) from public,anon;grant execute on function public.bar_shift_snapshot(uuid) to authenticated;
