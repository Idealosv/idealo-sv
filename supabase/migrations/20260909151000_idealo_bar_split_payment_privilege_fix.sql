-- IDEALO BAR · cobro de cuenta dividida sin abrir UPDATE directo de pagos a usuarios.
create or replace function public.bar_take_split_payment(p_split_id uuid,p_method text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_split public.bar_bill_splits%rowtype; v_result jsonb; v_payment uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into v_split from public.bar_bill_splits where id=p_split_id for update;
 if not found then raise exception 'División no encontrada.'; end if;
 if v_split.status<>'OPEN' then raise exception 'La división ya fue cerrada.'; end if;
 if not public.bar_has_permission(v_split.company_id,'payment.take') and not public.erp_can_admin(v_split.company_id) then raise exception 'Tu rol no puede cobrar esta división.'; end if;
 v_result:=public.bar_take_payment(v_split.order_id,p_method,v_split.amount,p_reference);
 v_payment:=(v_result->>'payment_id')::uuid;
 update public.bar_payments set bill_split_id=v_split.id where id=v_payment and company_id=v_split.company_id and order_id=v_split.order_id;
 if not found then raise exception 'No se pudo vincular el pago a la división.'; end if;
 update public.bar_bill_splits set status='PAID',paid_at=now(),updated_at=now() where id=v_split.id;
 return v_result||jsonb_build_object('split_id',v_split.id,'split_label',v_split.label);
end;$$;
revoke execute on function public.bar_take_split_payment(uuid,text,text) from public,anon;
grant execute on function public.bar_take_split_payment(uuid,text,text) to authenticated;
