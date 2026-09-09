create index if not exists bar_presentations_inventory_item_idx on public.bar_inventory_presentations(inventory_item_id);

drop policy if exists bar_bill_splits_write on public.bar_bill_splits;
create policy bar_bill_splits_insert on public.bar_bill_splits for insert to authenticated with check(public.erp_can_operate(company_id));
create policy bar_bill_splits_update on public.bar_bill_splits for update to authenticated using(public.erp_can_operate(company_id)) with check(public.erp_can_operate(company_id));
create policy bar_bill_splits_delete on public.bar_bill_splits for delete to authenticated using(public.erp_can_operate(company_id));

drop policy if exists bar_bill_split_items_write on public.bar_bill_split_items;
create policy bar_bill_split_items_insert on public.bar_bill_split_items for insert to authenticated with check(public.erp_can_operate(company_id));
create policy bar_bill_split_items_update on public.bar_bill_split_items for update to authenticated using(public.erp_can_operate(company_id)) with check(public.erp_can_operate(company_id));
create policy bar_bill_split_items_delete on public.bar_bill_split_items for delete to authenticated using(public.erp_can_operate(company_id));

drop policy if exists bar_tip_allocations_write on public.bar_tip_allocations;
create policy bar_tip_allocations_insert on public.bar_tip_allocations for insert to authenticated with check(public.erp_can_admin(company_id));
create policy bar_tip_allocations_update on public.bar_tip_allocations for update to authenticated using(public.erp_can_admin(company_id)) with check(public.erp_can_admin(company_id));
create policy bar_tip_allocations_delete on public.bar_tip_allocations for delete to authenticated using(public.erp_can_admin(company_id));

drop policy if exists bar_location_stock_write on public.bar_inventory_location_stock;
create policy bar_location_stock_insert on public.bar_inventory_location_stock for insert to authenticated with check(public.erp_can_operate(company_id));
create policy bar_location_stock_update on public.bar_inventory_location_stock for update to authenticated using(public.erp_can_operate(company_id)) with check(public.erp_can_operate(company_id));
create policy bar_location_stock_delete on public.bar_inventory_location_stock for delete to authenticated using(public.erp_can_admin(company_id));

drop policy if exists bar_presentations_write on public.bar_inventory_presentations;
create policy bar_presentations_insert on public.bar_inventory_presentations for insert to authenticated with check(public.erp_can_admin(company_id));
create policy bar_presentations_update on public.bar_inventory_presentations for update to authenticated using(public.erp_can_admin(company_id)) with check(public.erp_can_admin(company_id));
create policy bar_presentations_delete on public.bar_inventory_presentations for delete to authenticated using(public.erp_can_admin(company_id));

drop policy if exists bar_print_jobs_write on public.bar_print_jobs;
create policy bar_print_jobs_insert on public.bar_print_jobs for insert to authenticated with check(public.erp_can_operate(company_id));
create policy bar_print_jobs_update on public.bar_print_jobs for update to authenticated using(public.erp_can_operate(company_id)) with check(public.erp_can_operate(company_id));
create policy bar_print_jobs_delete on public.bar_print_jobs for delete to authenticated using(public.erp_can_admin(company_id));