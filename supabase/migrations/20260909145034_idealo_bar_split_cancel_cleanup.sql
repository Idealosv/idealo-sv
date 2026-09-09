create or replace function public.bar_close_open_splits_with_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in ('paid','cancelled') and old.status is distinct from new.status then update public.bar_bill_splits set status='CANCELLED',updated_at=now() where order_id=new.id and status='OPEN'; end if; return new;
end;$$;
drop trigger if exists bar_orders_close_open_splits on public.bar_orders;
create trigger bar_orders_close_open_splits after update of status on public.bar_orders for each row execute function public.bar_close_open_splits_with_order();
revoke execute on function public.bar_close_open_splits_with_order() from public,anon,authenticated;