-- Trigger de materiales de Producción necesita este helper bajo el rol autenticado.
revoke all on function public.refresh_inventory_reserved_stock(uuid) from public, anon;
grant execute on function public.refresh_inventory_reserved_stock(uuid) to authenticated;
