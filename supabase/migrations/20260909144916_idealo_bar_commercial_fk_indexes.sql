create index if not exists bar_tip_allocations_source_payment_idx on public.bar_tip_allocations(source_payment_id);
create index if not exists bar_location_stock_warehouse_idx on public.bar_inventory_location_stock(warehouse_id);
create index if not exists bar_location_stock_location_idx on public.bar_inventory_location_stock(location_id);
create index if not exists bar_stock_transfers_from_idx on public.bar_stock_transfers(from_stock_id);
create index if not exists bar_stock_transfers_to_idx on public.bar_stock_transfers(to_stock_id);
create index if not exists bar_print_jobs_order_idx on public.bar_print_jobs(order_id);