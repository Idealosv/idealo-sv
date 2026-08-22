create index if not exists inventory_movements_inventory_item_fkey_idx on inventory_movements(inventory_item_id);
create index if not exists inventory_movements_work_order_fkey_idx on inventory_movements(work_order_id) where work_order_id is not null;
create index if not exists inventory_movements_purchase_fkey_idx on inventory_movements(purchase_id) where purchase_id is not null;
create index if not exists work_order_costs_work_order_fkey_idx on work_order_costs(work_order_id);
create index if not exists purchase_items_inventory_item_fkey_idx on purchase_items(inventory_item_id) where inventory_item_id is not null;
