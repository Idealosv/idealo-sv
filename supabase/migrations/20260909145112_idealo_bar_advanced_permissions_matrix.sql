create or replace function public.bar_permissions_for_role(p_role text)
returns text[] language sql immutable set search_path=public as $$
select case lower(trim(coalesce(p_role,'')))
 when 'owner' then array['*']::text[]
 when 'manager' then array['*']::text[]
 when 'cashier' then array['operation.access','summary.view','sales.view','orders.view','payment.take','tip.manage','cash.view','cash.open','cash.cut','cash.close','reservation.view','delivery.view','advanced.view']::text[]
 when 'waiter' then array['operation.access','summary.view','sales.view','orders.view','order.create','order.edit','item.add','item.edit','item.void','order.send','order.cancel','bill.request','table.transfer','reservation.view','reservation.manage','delivery.view','delivery.manage','advanced.view']::text[]
 when 'kitchen' then array['operation.access','kitchen.view','kitchen.advance']::text[]
 when 'bar' then array['operation.access','bar.view','bar.advance']::text[]
 when 'warehouse' then array['inventory.view','inventory.manage','advanced.view']::text[]
 else array[]::text[] end;
$$;