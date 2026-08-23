-- IDEALO SV · Productos 360 · optimizaciones post-advisor

create index if not exists product_price_tiers_company_idx
  on public.product_price_tiers(company_id, product_id, min_quantity);

create index if not exists quote_items_product_id_idx
  on public.quote_items(product_id)
  where product_id is not null;

create index if not exists work_order_items_product_id_idx
  on public.work_order_items(product_id)
  where product_id is not null;

drop policy if exists "members manage finished products" on public.finished_products;
create policy "members manage finished products" on public.finished_products
for all to authenticated
using (exists(
  select 1 from public.company_members cm
  where cm.company_id = finished_products.company_id
    and cm.user_id = (select auth.uid())
))
with check (exists(
  select 1 from public.company_members cm
  where cm.company_id = finished_products.company_id
    and cm.user_id = (select auth.uid())
));
