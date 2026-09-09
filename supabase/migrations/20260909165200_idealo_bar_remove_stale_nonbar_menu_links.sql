delete from public.bar_menu_items m
using public.finished_products p
where p.id=m.product_id
  and m.active=false
  and coalesce(p.subcategory,'')<>'BAR'
  and not ('bar'=any(coalesce(p.tags,'{}'::text[])))
  and not exists(select 1 from public.bar_order_items oi where oi.menu_item_id=m.id);
