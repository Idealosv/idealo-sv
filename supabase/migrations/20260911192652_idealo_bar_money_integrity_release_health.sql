create or replace function public.bar_release_health(p_company_id uuid)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare
  v_readiness jsonb;v_runtime jsonb;v_integrity jsonb;v_security jsonb;v_operations jsonb;v_money jsonb;
  v_critical integer:=0;v_warnings integer:=0;v_score integer:=100;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede consultar la salud integral del sistema.'; end if;
  v_readiness:=public.bar_commercial_readiness(p_company_id);
  v_runtime:=public.bar_runtime_audit(p_company_id);
  v_money:=public.bar_money_integrity(p_company_id);
  v_integrity:=jsonb_build_object(
    'duplicate_active_table_orders',(select count(*) from (select table_id from public.bar_orders where company_id=p_company_id and table_id is not null and status not in ('paid','cancelled') group by table_id having count(*)>1)x),
    'paid_total_mismatch',(select count(*) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and abs(coalesce((select sum(p.amount) from public.bar_payments p where p.order_id=o.id),0)-o.total)>0.01),
    'overpaid_orders',(select count(*) from public.bar_orders o where o.company_id=p_company_id and coalesce((select sum(p.amount) from public.bar_payments p where p.order_id=o.id),0)>o.total+0.01),
    'available_table_with_open_order',(select count(*) from public.bar_tables t where t.company_id=p_company_id and t.status='available' and exists(select 1 from public.bar_orders o where o.table_id=t.id and o.status not in ('paid','cancelled'))),
    'busy_table_without_open_order',(select count(*) from public.bar_tables t where t.company_id=p_company_id and t.status in ('occupied','awaiting_payment') and not exists(select 1 from public.bar_orders o where o.table_id=t.id and o.status not in ('paid','cancelled'))),
    'orphan_payments',(select count(*) from public.bar_payments p left join public.bar_orders o on o.id=p.order_id and o.company_id=p.company_id where p.company_id=p_company_id and o.id is null),
    'invalid_payments',(select count(*) from public.bar_payments p where p.company_id=p_company_id and (p.amount<=0 or p.method not in ('cash','card','transfer','other'))),
    'broken_menu_products',(select count(*) from public.bar_menu_items m left join public.finished_products p on p.id=m.product_id and p.company_id=m.company_id where m.company_id=p_company_id and m.active=true and (p.id is null or p.active=false)),
    'active_menu_without_price',(select count(*) from public.bar_menu_items m join public.finished_products p on p.id=m.product_id where m.company_id=p_company_id and m.active=true and coalesce(m.sale_price_override,p.sale_price,0)<=0),
    'active_menu_without_recipe',(select count(*) from public.bar_menu_items m where m.company_id=p_company_id and m.active=true and not exists(select 1 from public.bar_recipe_components r where r.company_id=m.company_id and r.product_id=m.product_id and r.active=true)),
    'broken_recipe_inventory',(select count(*) from public.bar_recipe_components r left join public.inventory_items i on i.id=r.inventory_item_id and i.company_id=r.company_id where r.company_id=p_company_id and r.active=true and (i.id is null or i.active=false or i.deleted_at is not null)),
    'negative_inventory',(select count(*) from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null and i.current_stock<0),
    'negative_location_stock',(select count(*) from public.bar_inventory_location_stock s where s.company_id=p_company_id and s.quantity<0),
    'pending_cash_postings',(select count(*) from public.bar_payments p where p.company_id=p_company_id and p.financial_posting_status<>'posted'),
    'stale_print_jobs',(select count(*) from public.bar_print_jobs j where j.company_id=p_company_id and j.status='PENDING' and j.created_at<now()-interval '15 minutes'),
    'rejected_dte',(select count(*) from public.dte_documents d where d.company_id=p_company_id and d.bar_order_id is not null and d.status='REJECTED'),
    'refunds_without_movement',coalesce((v_money->>'refunds_without_movement')::int,0),
    'refund_amount_mismatch',coalesce((v_money->>'refund_amount_mismatch')::int,0),
    'over_refunded_orders',coalesce((v_money->>'over_refunded_orders')::int,0),
    'tip_payouts_without_movement',coalesce((v_money->>'tip_payouts_without_movement')::int,0),
    'earned_tips_already_paid',coalesce((v_money->>'earned_tips_already_paid')::int,0),
    'closed_cash_without_count',coalesce((v_money->>'closed_cash_without_count')::int,0)
  );
  v_security:=jsonb_build_object(
    'bar_tables_without_rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'bar_%' and not c.relrowsecurity),
    'bar_policies_for_anon',(select count(*) from pg_policies where schemaname='public' and tablename like 'bar_%' and roles::text like '%anon%'),
    'bar_functions_executable_by_anon',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'bar_%' and has_function_privilege('anon',p.oid,'EXECUTE')),
    'direct_product_guard',exists(select 1 from pg_trigger where tgname='zz_bar_finished_products_direct_write_guard' and not tgisinternal),
    'direct_inventory_guard',exists(select 1 from pg_trigger where tgname='zz_bar_inventory_items_direct_write_guard' and not tgisinternal),
    'reservation_overlap_guard',exists(select 1 from pg_trigger where tgname='bar_reservations_overlap_guard' and not tgisinternal),
    'automatic_menu_rank',exists(select 1 from pg_trigger where tgname='bar_orders_autorank_menu_after_paid' and not tgisinternal)
  );
  v_operations:=jsonb_build_object(
    'active_tables',(select count(*) from public.bar_tables where company_id=p_company_id and active=true),
    'active_menu_items',(select count(*) from public.bar_menu_items where company_id=p_company_id and active=true),
    'open_orders',(select count(*) from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled')),
    'open_cash_sessions',(select count(*) from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN'),
    'pending_print_jobs',(select count(*) from public.bar_print_jobs where company_id=p_company_id and status='PENDING'),
    'today_paid_orders',(select count(*) from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),
    'today_refunds',(select coalesce(sum(merchandise_refund),0) from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and (created_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),
    'today_tip_payouts',(select coalesce(sum(amount),0) from public.bar_tip_payouts where company_id=p_company_id and (paid_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),
    'today_sales',(
      select greatest(0,
        coalesce((select sum(greatest(subtotal-discount_total,0)) from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),0)
        - coalesce((select sum(merchandise_refund) from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and (created_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),0)
      )
    )
  );
  v_critical:=coalesce((v_integrity->>'duplicate_active_table_orders')::int,0)+coalesce((v_integrity->>'paid_total_mismatch')::int,0)+coalesce((v_integrity->>'overpaid_orders')::int,0)+coalesce((v_integrity->>'orphan_payments')::int,0)+coalesce((v_integrity->>'invalid_payments')::int,0)+coalesce((v_integrity->>'broken_menu_products')::int,0)+coalesce((v_integrity->>'active_menu_without_price')::int,0)+coalesce((v_integrity->>'active_menu_without_recipe')::int,0)+coalesce((v_integrity->>'broken_recipe_inventory')::int,0)+coalesce((v_integrity->>'negative_inventory')::int,0)+coalesce((v_integrity->>'negative_location_stock')::int,0)+coalesce((v_integrity->>'refunds_without_movement')::int,0)+coalesce((v_integrity->>'refund_amount_mismatch')::int,0)+coalesce((v_integrity->>'over_refunded_orders')::int,0)+coalesce((v_integrity->>'tip_payouts_without_movement')::int,0)+coalesce((v_integrity->>'earned_tips_already_paid')::int,0)+coalesce((v_security->>'bar_tables_without_rls')::int,0)+coalesce((v_security->>'bar_policies_for_anon')::int,0)+coalesce((v_security->>'bar_functions_executable_by_anon')::int,0);
  v_warnings:=coalesce((v_integrity->>'available_table_with_open_order')::int,0)+coalesce((v_integrity->>'busy_table_without_open_order')::int,0)+coalesce((v_integrity->>'pending_cash_postings')::int,0)+coalesce((v_integrity->>'stale_print_jobs')::int,0)+coalesce((v_integrity->>'rejected_dte')::int,0)+coalesce((v_integrity->>'closed_cash_without_count')::int,0);
  v_score:=greatest(0,100-least(80,v_critical*8)-least(20,v_warnings*2));
  return jsonb_build_object('score',v_score,'healthy',v_critical=0,'critical_issues',v_critical,'warnings',v_warnings,'readiness',v_readiness,'runtime',v_runtime,'integrity',v_integrity,'security',v_security,'operations',v_operations,'checked_at',now());
end;$$;
