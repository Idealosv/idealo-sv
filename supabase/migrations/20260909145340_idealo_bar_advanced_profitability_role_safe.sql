create or replace function public.bar_advanced_profitability(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb language plpgsql stable set search_path=public as $$
declare v_result jsonb;
begin
 if not public.erp_can_read_finance(p_company_id) then return '{}'::jsonb; end if;
 select jsonb_build_object(
  'summary',jsonb_build_object('sales',coalesce(sum(o.total),0),'discounts',coalesce(sum(o.discount_total),0),'tips',coalesce(sum(o.tip_total),0),'orders',count(*),'avg_ticket',coalesce(avg(o.total),0)),
  'by_hour',(select coalesce(jsonb_agg(x order by (x->>'hour')::int),'[]'::jsonb) from (select jsonb_build_object('hour',extract(hour from closed_at at time zone 'America/El_Salvador')::int,'sales',sum(total),'orders',count(*)) x from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to group by 1) q),
  'tips_by_waiter',(select coalesce(jsonb_agg(x order by (x->>'tips')::numeric desc),'[]'::jsonb) from (select jsonb_build_object('user_id',recipient_user_id,'tips',sum(amount),'count',count(*)) x from public.bar_tip_allocations where company_id=p_company_id and status='EARNED' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to group by recipient_user_id) q),
  'losses',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type in ('WASTE','DAMAGE') and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to),
  'courtesies',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type='COURTESY' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to)
 ) into v_result from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and (o.closed_at at time zone 'America/El_Salvador')::date between p_from and p_to;
 return coalesce(v_result,'{}'::jsonb);
end;$$;