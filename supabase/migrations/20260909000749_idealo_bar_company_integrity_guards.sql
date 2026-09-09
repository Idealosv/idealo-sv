create or replace function public.bar_validate_company_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'bar_menu_items' then
    if not exists (
      select 1 from public.finished_products p
      where p.id = new.product_id and p.company_id = new.company_id
    ) then
      raise exception 'El producto no pertenece a la empresa de IDEALO BAR.';
    end if;
  elsif tg_table_name = 'bar_orders' then
    if new.table_id is not null and not exists (
      select 1 from public.bar_tables t
      where t.id = new.table_id and t.company_id = new.company_id
    ) then
      raise exception 'La mesa no pertenece a la empresa de IDEALO BAR.';
    end if;
  elsif tg_table_name = 'bar_order_items' then
    if not exists (
      select 1 from public.bar_orders o
      where o.id = new.order_id and o.company_id = new.company_id
    ) then
      raise exception 'La orden no pertenece a la empresa de IDEALO BAR.';
    end if;
    if not exists (
      select 1 from public.finished_products p
      where p.id = new.product_id and p.company_id = new.company_id
    ) then
      raise exception 'El producto del pedido no pertenece a la empresa de IDEALO BAR.';
    end if;
    if new.menu_item_id is not null and not exists (
      select 1 from public.bar_menu_items m
      where m.id = new.menu_item_id and m.company_id = new.company_id and m.product_id = new.product_id
    ) then
      raise exception 'El producto del menú no corresponde a la empresa o producto del pedido.';
    end if;
  elsif tg_table_name = 'bar_payments' then
    if not exists (
      select 1 from public.bar_orders o
      where o.id = new.order_id and o.company_id = new.company_id
    ) then
      raise exception 'El cobro no corresponde a una orden de esta empresa.';
    end if;
    if new.cash_register_session_id is not null and not exists (
      select 1 from public.cash_register_sessions s
      where s.id = new.cash_register_session_id and s.company_id = new.company_id
    ) then
      raise exception 'La sesión de caja no pertenece a la empresa del pedido.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.bar_validate_company_links() from public, anon, authenticated;

drop trigger if exists bar_menu_items_company_guard on public.bar_menu_items;
create trigger bar_menu_items_company_guard before insert or update on public.bar_menu_items for each row execute function public.bar_validate_company_links();
drop trigger if exists bar_orders_company_guard on public.bar_orders;
create trigger bar_orders_company_guard before insert or update on public.bar_orders for each row execute function public.bar_validate_company_links();
drop trigger if exists bar_order_items_company_guard on public.bar_order_items;
create trigger bar_order_items_company_guard before insert or update on public.bar_order_items for each row execute function public.bar_validate_company_links();
drop trigger if exists bar_payments_company_guard on public.bar_payments;
create trigger bar_payments_company_guard before insert or update on public.bar_payments for each row execute function public.bar_validate_company_links();
