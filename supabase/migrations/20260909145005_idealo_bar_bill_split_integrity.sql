create or replace function public.bar_validate_bill_split()
returns trigger language plpgsql set search_path=public as $$
declare v_total numeric; v_paid numeric; v_open numeric;
begin
 select total into v_total from public.bar_orders where id=new.order_id and company_id=new.company_id; if not found then raise exception 'Pedido de división inválido.'; end if;
 select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=new.order_id;
 select coalesce(sum(amount),0) into v_open from public.bar_bill_splits where order_id=new.order_id and status='OPEN' and id is distinct from new.id;
 if new.status='OPEN' and v_paid+v_open+new.amount>v_total+0.01 then raise exception 'Las divisiones abiertas superan el saldo del pedido.'; end if;
 return new;
end;$$;
drop trigger if exists bar_bill_splits_validate on public.bar_bill_splits;
create trigger bar_bill_splits_validate before insert or update on public.bar_bill_splits for each row execute function public.bar_validate_bill_split();