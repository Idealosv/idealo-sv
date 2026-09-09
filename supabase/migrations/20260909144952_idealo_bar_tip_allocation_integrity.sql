create or replace function public.bar_validate_tip_allocation()
returns trigger language plpgsql set search_path=public as $$
declare v_tip numeric; v_sum numeric; v_payment public.bar_payments%rowtype;
begin
 select tip_total into v_tip from public.bar_orders where id=new.order_id and company_id=new.company_id; if not found then raise exception 'Pedido de propina inválido.'; end if;
 if new.source_payment_id is not null then select * into v_payment from public.bar_payments where id=new.source_payment_id; if not found or v_payment.order_id<>new.order_id or v_payment.company_id<>new.company_id then raise exception 'Pago de origen no corresponde al pedido.'; end if; end if;
 select coalesce(sum(amount),0) into v_sum from public.bar_tip_allocations where order_id=new.order_id and status<>'VOID' and id is distinct from new.id;
 if v_sum+new.amount>coalesce(v_tip,0)+0.01 then raise exception 'La distribución de propina supera la propina del pedido.'; end if;
 return new;
end;$$;
drop trigger if exists bar_tip_allocations_validate on public.bar_tip_allocations;
create trigger bar_tip_allocations_validate before insert or update on public.bar_tip_allocations for each row execute function public.bar_validate_tip_allocation();