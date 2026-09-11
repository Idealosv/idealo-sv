-- Los cierres históricos previos al arqueo profesional no podían tener conteo por denominación.
-- Solo los cierres hechos desde la entrada de esta función deben exigir bar_cash_count_lines.
create or replace function public.bar_money_integrity(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_data jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Gerencia puede auditar dinero.'; end if;
 select jsonb_build_object(
  'refunds_without_movement',(select count(*) from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and cash_movement_id is null),
  'refund_amount_mismatch',(select count(*) from public.bar_refunds r where r.company_id=p_company_id and r.status='COMPLETED' and abs(r.merchandise_refund+r.tip_refund-r.amount)>0.01),
  'over_refunded_orders',(select count(*) from public.bar_orders o where o.company_id=p_company_id and coalesce((select sum(r.amount) from public.bar_refunds r where r.order_id=o.id and r.status='COMPLETED'),0)>o.total+0.01),
  'tip_payouts_without_movement',(select count(*) from public.bar_tip_payouts where company_id=p_company_id and cash_movement_id is null),
  'earned_tips_already_paid',(select count(*) from public.bar_tip_allocations a where a.company_id=p_company_id and a.status='EARNED' and exists(select 1 from public.bar_tip_payout_items pi where pi.tip_allocation_id=a.id)),
  'closed_cash_without_count',(select count(*) from public.cash_register_sessions s where s.company_id=p_company_id and s.status='CLOSED' and s.closed_at>=timestamptz '2026-09-11 19:20:45+00' and not exists(select 1 from public.bar_cash_count_lines l where l.session_id=s.id))
 ) into v_data;
 return v_data;
end;$$;
revoke execute on function public.bar_money_integrity(uuid) from public,anon;
grant execute on function public.bar_money_integrity(uuid) to authenticated;
