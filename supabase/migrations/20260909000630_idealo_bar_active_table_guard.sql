create unique index if not exists bar_orders_one_active_per_table_idx
on public.bar_orders(table_id)
where table_id is not null and status not in ('paid','cancelled');
