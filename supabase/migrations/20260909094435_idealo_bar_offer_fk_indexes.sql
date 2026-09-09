create index if not exists bar_promotions_product_fk_idx on public.bar_promotions(product_id);
create index if not exists bar_bundle_product_fk_idx on public.bar_bundle_definitions(product_id);
