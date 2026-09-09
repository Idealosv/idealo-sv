alter function public.bar_checkout_order(uuid,text,text) security definer;
alter function public.bar_checkout_order(uuid,text,text) set search_path = 'public';
revoke all on function public.bar_checkout_order(uuid,text,text) from public, anon;
grant execute on function public.bar_checkout_order(uuid,text,text) to authenticated;
comment on function public.bar_checkout_order(uuid,text,text) is 'IDEALO BAR checkout: SECURITY DEFINER intentionally limited by erp_can_operate(order.company_id), fixed search_path, authenticated execute only.';
