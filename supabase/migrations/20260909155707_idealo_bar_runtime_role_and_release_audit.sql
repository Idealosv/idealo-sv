create or replace function public.bar_runtime_audit(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v_matrix_ok boolean;v_trigger_count int;v_roles jsonb;v_pending jsonb;v_active_roles jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.manage') and not public.erp_can_admin(p_company_id) then raise exception 'Solo Propietario o Gerente puede ejecutar la auditoría integral.'; end if;
 v_matrix_ok:=('*'=any(public.bar_permissions_for_role('owner')))
  and ('*'=any(public.bar_permissions_for_role('manager')))
  and ('payment.take'=any(public.bar_permissions_for_role('cashier'))) and not ('order.create'=any(public.bar_permissions_for_role('cashier')))
  and ('order.create'=any(public.bar_permissions_for_role('waiter'))) and not ('payment.take'=any(public.bar_permissions_for_role('waiter')))
  and ('kitchen.advance'=any(public.bar_permissions_for_role('kitchen'))) and not ('bar.advance'=any(public.bar_permissions_for_role('kitchen')))
  and ('bar.advance'=any(public.bar_permissions_for_role('bar'))) and not ('kitchen.advance'=any(public.bar_permissions_for_role('bar')))
  and ('inventory.manage'=any(public.bar_permissions_for_role('warehouse'))) and not ('operation.access'=any(public.bar_permissions_for_role('warehouse')));
 select count(*) into v_trigger_count from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgname in ('bar_orders_role_insert_guard','bar_order_items_role_insert_guard','bar_order_items_role_delete_guard','bar_reservations_role_write_guard','bar_tables_role_insert_guard','bar_tables_role_delete_guard','zz_bar_orders_role_guard','zz_bar_order_items_role_guard','bar_order_items_enqueue_print_job','bar_orders_auto_dte_after_paid','bar_order_item_recipe_consume');
 v_roles:=jsonb_build_object('owner',to_jsonb(public.bar_permissions_for_role('owner')),'manager',to_jsonb(public.bar_permissions_for_role('manager')),'cashier',to_jsonb(public.bar_permissions_for_role('cashier')),'waiter',to_jsonb(public.bar_permissions_for_role('waiter')),'kitchen',to_jsonb(public.bar_permissions_for_role('kitchen')),'bar',to_jsonb(public.bar_permissions_for_role('bar')),'warehouse',to_jsonb(public.bar_permissions_for_role('warehouse')));
 select coalesce(jsonb_object_agg(bar_role,n),'{}'::jsonb) into v_active_roles from (select bar_role,count(*) n from public.bar_staff_assignments where company_id=p_company_id and active=true group by bar_role)x;
 v_pending:=jsonb_build_object(
  'open_orders',(select count(*) from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled')),
  'open_cash_sessions',(select count(*) from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN'),
  'pending_print_jobs',(select count(*) from public.bar_print_jobs where company_id=p_company_id and status='PENDING'),
  'pending_cash_postings',(select count(*) from public.bar_payments where company_id=p_company_id and financial_posting_status<>'posted'),
  'dte_draft',(select count(*) from public.dte_documents where company_id=p_company_id and bar_order_id is not null and status in ('DRAFT','SIGNED','TRANSMITTING','TRANSMISSION_UNKNOWN')),
  'dte_rejected',(select count(*) from public.dte_documents where company_id=p_company_id and bar_order_id is not null and status='REJECTED')
 );
 return jsonb_build_object('permission_matrix_ok',v_matrix_ok,'enforcement_triggers_found',v_trigger_count,'enforcement_triggers_expected',11,'trigger_enforcement_ok',v_trigger_count=11,'active_role_counts',v_active_roles,'role_matrix',v_roles,'pending',v_pending,'runtime_ready',v_matrix_ok and v_trigger_count=11);
end;$$;
revoke execute on function public.bar_runtime_audit(uuid) from public,anon;
grant execute on function public.bar_runtime_audit(uuid) to authenticated;