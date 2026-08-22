create or replace view public.client_commercial_intelligence with (security_invoker=true) as
with
wo as (
  select company_id,client_id,count(*)::int order_count,count(*) filter(where status='DELIVERED')::int delivered_count,
    coalesce(sum(total),0)::numeric lifetime_sales,coalesce(avg(nullif(total,0)),0)::numeric avg_ticket,max(created_at) last_order_at,min(created_at) first_order_at
  from public.work_orders group by company_id,client_id
),
q as (
  select company_id,client_id,count(*)::int quote_count,count(*) filter(where status in('APPROVED','CONVERTED'))::int approved_quote_count,
    count(*) filter(where status in('DRAFT','SENT','APPROVED'))::int open_quote_count
  from public.quotes group by company_id,client_id
),
cost as (
  select w.company_id,w.client_id,coalesce(sum(c.amount),0)::numeric total_cost
  from public.work_orders w left join public.work_order_costs c on c.work_order_id=w.id and c.company_id=w.company_id group by w.company_id,w.client_id
),
ar as (
  select company_id,client_id,coalesce(sum(amount_total-amount_paid),0)::numeric outstanding_balance,
    coalesce(sum(case when due_date<current_date and amount_total>amount_paid then amount_total-amount_paid else 0 end),0)::numeric overdue_balance,
    count(*) filter(where due_date<current_date and amount_total>amount_paid)::int overdue_count
  from public.accounts_receivable group by company_id,client_id
),
pay as (
  select r.company_id,r.client_id,coalesce(avg(greatest(0,(p.last_paid_at::date-r.due_date))),0)::numeric avg_payment_delay_days
  from public.accounts_receivable r join(select receivable_id,max(paid_at) last_paid_at from public.customer_payments group by receivable_id)p on p.receivable_id=r.id
  where r.due_date is not null group by r.company_id,r.client_id
),
qi as (
  select w.company_id,w.client_id,count(i.id)::int quality_incident_count,
    coalesce(sum(coalesce(i.material_cost,0)+coalesce(i.labor_cost,0)+coalesce(i.outsourced_cost,0)+coalesce(i.other_cost,0)),0)::numeric quality_cost
  from public.work_orders w left join public.quality_incidents i on i.work_order_id=w.id and i.company_id=w.company_id group by w.company_id,w.client_id
),
ci as (
  select company_id,client_id,max(occurred_at) last_interaction_at,
    min(next_follow_up_at) filter(where next_follow_up_at is not null and next_follow_up_at>=now()-interval '30 days') next_follow_up_at
  from public.client_interactions group by company_id,client_id
),
base as (
  select c.id client_id,c.company_id,c.name,coalesce(wo.order_count,0) order_count,coalesce(wo.delivered_count,0) delivered_count,
    coalesce(wo.lifetime_sales,0) lifetime_sales,coalesce(wo.avg_ticket,0) avg_ticket,wo.last_order_at,wo.first_order_at,
    coalesce(q.quote_count,0) quote_count,coalesce(q.approved_quote_count,0) approved_quote_count,coalesce(q.open_quote_count,0) open_quote_count,
    case when coalesce(q.quote_count,0)=0 then 0 else round((q.approved_quote_count::numeric/q.quote_count::numeric)*100,1) end conversion_rate,
    coalesce(cost.total_cost,0)+coalesce(qi.quality_cost,0) total_cost,coalesce(ar.outstanding_balance,0) outstanding_balance,
    coalesce(ar.overdue_balance,0) overdue_balance,coalesce(ar.overdue_count,0) overdue_count,coalesce(pay.avg_payment_delay_days,0) avg_payment_delay_days,
    coalesce(qi.quality_incident_count,0) quality_incident_count,ci.last_interaction_at,ci.next_follow_up_at
  from public.clients c
  left join wo on wo.company_id=c.company_id and wo.client_id=c.id left join q on q.company_id=c.company_id and q.client_id=c.id
  left join cost on cost.company_id=c.company_id and cost.client_id=c.id left join ar on ar.company_id=c.company_id and ar.client_id=c.id
  left join pay on pay.company_id=c.company_id and pay.client_id=c.id left join qi on qi.company_id=c.company_id and qi.client_id=c.id
  left join ci on ci.company_id=c.company_id and ci.client_id=c.id
),
scored as (
  select b.*,(b.lifetime_sales-b.total_cost)::numeric estimated_profit,
    case when b.lifetime_sales>0 then round(((b.lifetime_sales-b.total_cost)/b.lifetime_sales)*100,1) else 0 end estimated_margin_pct,
    case when b.first_order_at is not null and b.order_count>1 then round((extract(epoch from(coalesce(b.last_order_at,now())-b.first_order_at))/86400)/greatest(1,b.order_count-1),1) else null end avg_days_between_orders,
    least(100,greatest(0,
      (case when b.last_order_at is null then 4 when b.last_order_at>=now()-interval '30 days' then 20 when b.last_order_at>=now()-interval '60 days' then 16 when b.last_order_at>=now()-interval '90 days' then 12 when b.last_order_at>=now()-interval '180 days' then 6 else 0 end)
      +least(15,b.order_count*3)
      +(case when b.lifetime_sales>=5000 then 20 when b.lifetime_sales>=2000 then 16 when b.lifetime_sales>=500 then 12 when b.lifetime_sales>0 then 6 else 0 end)
      +(case when b.overdue_balance=0 then 20 when b.outstanding_balance>0 and b.overdue_balance/b.outstanding_balance<=0.15 then 12 when b.outstanding_balance>0 and b.overdue_balance/b.outstanding_balance<=0.40 then 6 else 0 end)
      +least(10,round(b.conversion_rate/10.0))
      +(case when b.lifetime_sales=0 then 5 when(b.lifetime_sales-b.total_cost)/nullif(b.lifetime_sales,0)>=0.35 then 10 when(b.lifetime_sales-b.total_cost)/nullif(b.lifetime_sales,0)>=0.20 then 7 when(b.lifetime_sales-b.total_cost)/nullif(b.lifetime_sales,0)>0 then 3 else 0 end)
      +(case when b.quality_incident_count=0 then 5 when b.quality_incident_count=1 then 3 else 0 end)
    ))::int commercial_score
  from base b
)
select s.*,
  case when s.overdue_balance>0 then 'EN_RIESGO' when s.order_count>0 and s.last_order_at<now()-interval '180 days' then 'INACTIVO'
    when s.commercial_score>=80 and s.lifetime_sales>=1000 then 'VIP' when s.order_count=0 and s.quote_count>0 then 'PROSPECTO'
    when s.order_count=0 then 'NUEVO' else 'ACTIVO' end commercial_segment,
  case when s.overdue_balance>0 then 'COBRAR_SALDO_VENCIDO' when s.next_follow_up_at is not null and s.next_follow_up_at<=now() then 'DAR_SEGUIMIENTO_HOY'
    when s.open_quote_count>0 then 'SEGUIR_COTIZACION' when s.order_count>0 and s.last_order_at<now()-interval '90 days' then 'REACTIVAR_CLIENTE'
    when s.commercial_score>=75 then 'FIDELIZAR_Y_PEDIR_REFERIDOS' when s.order_count=0 then 'GENERAR_PRIMERA_VENTA' else 'PROPONER_RECOMPRA' end next_best_action,
  case when s.overdue_balance>0 then 'Tiene saldo vencido; priorizar cobranza antes de ampliar crédito.'
    when s.next_follow_up_at is not null and s.next_follow_up_at<=now() then 'Existe un seguimiento comercial pendiente o vencido.'
    when s.open_quote_count>0 then 'Tiene cotizaciones abiertas que conviene mover a cierre.'
    when s.order_count>0 and s.last_order_at<now()-interval '90 days' then 'Cliente sin compra reciente; conviene campaña de reactivación.'
    when s.commercial_score>=75 then 'Cliente de alto valor; conviene fidelizar, ofrecer recompra y solicitar referidos.'
    when s.order_count=0 then 'Aún no registra compra; enfocar esfuerzo en convertir la primera venta.'
    else 'Relación activa; sugerir recompra según frecuencia histórica.' end recommendation
from scored s;

grant select on public.client_commercial_intelligence to authenticated;
