create index if not exists bar_recipe_components_product_fk_idx on public.bar_recipe_components(product_id);
create index if not exists bar_recipe_components_inventory_fk_idx on public.bar_recipe_components(inventory_item_id);
create index if not exists bar_recipe_components_created_by_idx on public.bar_recipe_components(created_by);
create index if not exists bar_inventory_consumptions_order_fk_idx on public.bar_inventory_consumptions(order_id);
create index if not exists bar_inventory_consumptions_recipe_component_idx on public.bar_inventory_consumptions(recipe_component_id);
create index if not exists bar_inventory_consumptions_created_by_idx on public.bar_inventory_consumptions(created_by);

drop policy if exists bar_recipe_components_write on public.bar_recipe_components;
drop policy if exists bar_recipe_components_insert on public.bar_recipe_components;
drop policy if exists bar_recipe_components_update on public.bar_recipe_components;
drop policy if exists bar_recipe_components_delete on public.bar_recipe_components;
create policy bar_recipe_components_insert on public.bar_recipe_components for insert to authenticated with check (public.erp_can_operate(company_id));
create policy bar_recipe_components_update on public.bar_recipe_components for update to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));
create policy bar_recipe_components_delete on public.bar_recipe_components for delete to authenticated using (public.erp_can_operate(company_id));

drop policy if exists bar_inventory_consumptions_write on public.bar_inventory_consumptions;
drop policy if exists bar_inventory_consumptions_insert on public.bar_inventory_consumptions;
create policy bar_inventory_consumptions_insert on public.bar_inventory_consumptions for insert to authenticated with check (public.erp_can_operate(company_id));