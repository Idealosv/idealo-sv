alter policy bar_tables_select on public.bar_tables using (public.erp_can_read(company_id));
alter policy bar_tables_insert on public.bar_tables with check (public.erp_can_operate(company_id));
alter policy bar_tables_update on public.bar_tables using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
alter policy bar_tables_delete on public.bar_tables using (public.erp_can_operate(company_id));

alter policy bar_menu_items_select on public.bar_menu_items using (public.erp_can_read(company_id));
alter policy bar_menu_items_insert on public.bar_menu_items with check (public.erp_can_operate(company_id));
alter policy bar_menu_items_update on public.bar_menu_items using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
alter policy bar_menu_items_delete on public.bar_menu_items using (public.erp_can_operate(company_id));

alter policy bar_orders_select on public.bar_orders using (public.erp_can_read(company_id));
alter policy bar_orders_insert on public.bar_orders with check (public.erp_can_operate(company_id));
alter policy bar_orders_update on public.bar_orders using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
alter policy bar_orders_delete on public.bar_orders using (public.erp_can_operate(company_id));

alter policy bar_order_items_select on public.bar_order_items using (public.erp_can_read(company_id));
alter policy bar_order_items_insert on public.bar_order_items with check (public.erp_can_operate(company_id));
alter policy bar_order_items_update on public.bar_order_items using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
alter policy bar_order_items_delete on public.bar_order_items using (public.erp_can_operate(company_id));

alter policy bar_payments_select on public.bar_payments using (public.erp_can_read(company_id));
alter policy bar_payments_insert on public.bar_payments with check (public.erp_can_operate(company_id));
