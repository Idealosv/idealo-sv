create index if not exists bar_menu_items_product_idx on public.bar_menu_items(product_id);
create index if not exists bar_order_items_menu_item_idx on public.bar_order_items(menu_item_id) where menu_item_id is not null;
create index if not exists bar_order_items_product_idx on public.bar_order_items(product_id);
create index if not exists bar_payments_cash_register_session_idx on public.bar_payments(cash_register_session_id) where cash_register_session_id is not null;
create index if not exists bar_payments_company_idx on public.bar_payments(company_id);
