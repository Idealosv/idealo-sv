create index if not exists bar_bill_splits_company_idx on public.bar_bill_splits(company_id);
create index if not exists bar_bill_split_items_company_idx on public.bar_bill_split_items(company_id);
create index if not exists bar_tip_allocations_company_idx on public.bar_tip_allocations(company_id);
create index if not exists bar_stock_transfers_company_idx on public.bar_stock_transfers(company_id);
create index if not exists bar_delivery_events_company_idx on public.bar_delivery_events(company_id);
create index if not exists bar_location_consumption_company_idx on public.bar_location_consumption_allocations(company_id);