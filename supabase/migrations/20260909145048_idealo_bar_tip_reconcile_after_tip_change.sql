create or replace function public.bar_reconcile_existing_tip(p_order_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_order public.bar_orders%rowtype; v_paid numeric; v_alloc numeric; v_target numeric; v_piece numeric; v_payment public.bar_payments%rowtype;
begin
 select * into v_order from public.bar_orders where id=p_order_id; if not found then raise exception 'Pedido no encontrado.'; end if;
 if auth.uid() is not null and not public.bar_has_permission(v_order.company_id,'tip.manage') and not public.erp_can_admin(v_order.company_id) then raise exception 'Sin permiso para reconciliar propina.'; end if;
 if coalesce(v_order.tip_total,0)<=0 or v_order.waiter_id is null then return 0; end if;
 select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=v_order.id; select coalesce(sum(amount),0) into v_alloc from public.bar_tip_allocations where order_id=v_order.id and status<>'VOID';
 v_target:=case when coalesce(v_order.total,0)>0 then round(v_order.tip_total*least(v_paid/v_order.total,1),2) else 0 end; v_piece:=round(greatest(v_target-v_alloc,0),2);
 if v_piece>0 then select * into v_payment from public.bar_payments where order_id=v_order.id order by created_at desc limit 1; insert into public.bar_tip_allocations(company_id,order_id,recipient_user_id,source_payment_id,method,amount) values(v_order.company_id,v_order.id,v_order.waiter_id,v_payment.id,coalesce(v_payment.method,'cash'),v_piece); end if;
 return v_piece;
end;$$;
revoke execute on function public.bar_reconcile_existing_tip(uuid) from public,anon;
grant execute on function public.bar_reconcile_existing_tip(uuid) to authenticated;