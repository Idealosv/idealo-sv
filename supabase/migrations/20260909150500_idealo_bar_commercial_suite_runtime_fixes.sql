-- IDEALO BAR · correcciones runtime para suite comercial
create or replace function public.bar_advanced_profitability(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb language plpgsql stable set search_path=public as $$
declare v_result jsonb;
begin
 if not public.erp_can_read_finance(p_company_id) then return '{}'::jsonb; end if;
 select jsonb_build_object(
  'summary',jsonb_build_object('sales',coalesce(sum(o.total),0),'discounts',coalesce(sum(o.discount_total),0),'tips',coalesce(sum(o.tip_total),0),'orders',count(*),'avg_ticket',coalesce(avg(o.total),0)),
  'by_hour',(select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour_num,'sales',h.sales,'orders',h.orders) order by h.hour_num),'[]'::jsonb) from (select extract(hour from closed_at at time zone 'America/El_Salvador')::int hour_num,sum(total) sales,count(*) orders from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to group by extract(hour from closed_at at time zone 'America/El_Salvador')::int) h),
  'tips_by_waiter',(select coalesce(jsonb_agg(jsonb_build_object('user_id',t.recipient_user_id,'tips',t.tips,'count',t.tip_count) order by t.tips desc),'[]'::jsonb) from (select recipient_user_id,sum(amount) tips,count(*) tip_count from public.bar_tip_allocations where company_id=p_company_id and status='EARNED' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to group by recipient_user_id) t),
  'losses',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type in ('WASTE','DAMAGE') and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to),
  'courtesies',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type='COURTESY' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to)
 ) into v_result from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and (o.closed_at at time zone 'America/El_Salvador')::date between p_from and p_to;
 return coalesce(v_result,'{}'::jsonb);
end;$$;

create or replace function public.bar_enqueue_station_print_job()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_settings public.bar_settings%rowtype; v_printer text;
begin
 if old.status='new' and new.status='sent' and new.station in ('kitchen','bar') then
   select * into v_order from public.bar_orders where id=new.order_id;
   select * into v_settings from public.bar_settings where company_id=new.company_id;
   v_printer:=case when new.station='kitchen' then nullif(v_settings.kitchen_printer_name,'') else nullif(v_settings.bar_printer_name,'') end;
   insert into public.bar_print_jobs(company_id,order_id,station,ticket_type,payload,printer_name,status,created_by)
   values(new.company_id,new.order_id,new.station,'COMMAND',jsonb_build_object('order_code',v_order.order_code,'order_type',v_order.order_type,'table_id',v_order.table_id,'customer_name',v_order.customer_name,'item_id',new.id,'item_name',new.item_name,'quantity',new.quantity,'notes',new.notes,'sent_at',now()),v_printer,'PENDING',auth.uid());
 end if;
 return new;
end;$$;

drop trigger if exists bar_order_items_enqueue_print_job on public.bar_order_items;
create trigger bar_order_items_enqueue_print_job after update of status on public.bar_order_items for each row execute function public.bar_enqueue_station_print_job();
revoke execute on function public.bar_enqueue_station_print_job() from public,anon,authenticated;
