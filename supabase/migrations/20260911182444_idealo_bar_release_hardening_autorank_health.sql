-- IDEALO BAR · release hardening, seguridad, ranking automático y salud operativa

revoke execute on function public.bar_apply_active_promotion() from public, anon, authenticated;
revoke execute on function public.bar_consume_recipe_on_send() from public, anon, authenticated;
revoke execute on function public.bar_group_demo_menu_category() from public, anon, authenticated;
revoke execute on function public.bar_guard_item_delete() from public, anon, authenticated;
revoke execute on function public.bar_guard_item_insert() from public, anon, authenticated;
revoke execute on function public.bar_guard_order_insert() from public, anon, authenticated;
revoke execute on function public.bar_guard_reservation_write() from public, anon, authenticated;
revoke execute on function public.bar_guard_table_structure_write() from public, anon, authenticated;
revoke execute on function public.bar_money_words(numeric) from public, anon, authenticated;

drop policy if exists bar_menu_items_select on public.bar_menu_items;
drop policy if exists bar_menu_items_insert on public.bar_menu_items;
drop policy if exists bar_menu_items_update on public.bar_menu_items;
drop policy if exists bar_menu_items_delete on public.bar_menu_items;
create policy bar_menu_items_select on public.bar_menu_items for select to authenticated
using (public.bar_has_permission(company_id,'item.add') or public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_menu_items_insert on public.bar_menu_items for insert to authenticated
with check (public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_menu_items_update on public.bar_menu_items for update to authenticated
using (public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.manage'))
with check (public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_menu_items_delete on public.bar_menu_items for delete to authenticated
using (public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.manage'));

drop policy if exists bar_recipe_components_read on public.bar_recipe_components;
drop policy if exists bar_recipe_components_insert on public.bar_recipe_components;
drop policy if exists bar_recipe_components_update on public.bar_recipe_components;
drop policy if exists bar_recipe_components_delete on public.bar_recipe_components;
create policy bar_recipe_components_read on public.bar_recipe_components for select to authenticated
using (public.bar_has_permission(company_id,'inventory.view') or public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'catalog.manage') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_recipe_components_insert on public.bar_recipe_components for insert to authenticated
with check (public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_recipe_components_update on public.bar_recipe_components for update to authenticated
using (public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.manage'))
with check (public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_recipe_components_delete on public.bar_recipe_components for delete to authenticated
using (public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.manage'));

drop policy if exists bar_inventory_consumptions_read on public.bar_inventory_consumptions;
create policy bar_inventory_consumptions_read on public.bar_inventory_consumptions for select to authenticated
using (public.bar_has_permission(company_id,'inventory.view') or public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));

drop policy if exists bar_inventory_events_read on public.bar_inventory_events;
create policy bar_inventory_events_read on public.bar_inventory_events for select to authenticated
using (public.bar_has_permission(company_id,'inventory.view') or public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));

drop policy if exists bar_location_consumption_read on public.bar_location_consumption_allocations;
create policy bar_location_consumption_read on public.bar_location_consumption_allocations for select to authenticated
using (public.bar_has_permission(company_id,'inventory.view') or public.bar_has_permission(company_id,'inventory.manage') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));

drop policy if exists bar_dte_requests_read on public.bar_dte_requests;
drop policy if exists bar_dte_requests_insert on public.bar_dte_requests;
drop policy if exists bar_dte_requests_update on public.bar_dte_requests;
create policy bar_dte_requests_read on public.bar_dte_requests for select to authenticated
using (public.bar_has_permission(company_id,'payment.take') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_dte_requests_insert on public.bar_dte_requests for insert to authenticated
with check (public.bar_has_permission(company_id,'payment.take') or public.bar_has_permission(company_id,'admin.manage'));
create policy bar_dte_requests_update on public.bar_dte_requests for update to authenticated
using (public.bar_has_permission(company_id,'admin.manage'))
with check (public.bar_has_permission(company_id,'admin.manage'));

create or replace function public.bar_guard_finished_product_direct_write()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_company uuid; v_is_bar boolean:=false;
begin
 if tg_op='DELETE' then
  v_company:=old.company_id;
  v_is_bar:=upper(coalesce(old.subcategory,''))='BAR' or coalesce(old.tags,'{}'::text[]) @> array['bar']::text[];
 else
  v_company:=new.company_id;
  v_is_bar:=upper(coalesce(new.subcategory,''))='BAR' or coalesce(new.tags,'{}'::text[]) @> array['bar']::text[];
  if tg_op='UPDATE' then v_is_bar:=v_is_bar or upper(coalesce(old.subcategory,''))='BAR' or coalesce(old.tags,'{}'::text[]) @> array['bar']::text[]; end if;
 end if;
 if auth.uid() is null or pg_trigger_depth()>1 or not v_is_bar then return case when tg_op='DELETE' then old else new end; end if;
 if public.bar_has_permission(v_company,'catalog.manage') or public.bar_has_permission(v_company,'admin.manage') then return case when tg_op='DELETE' then old else new end; end if;
 raise exception 'Tu rol no puede modificar directamente productos de IDEALO BAR.';
end;$$;
revoke execute on function public.bar_guard_finished_product_direct_write() from public, anon, authenticated;
drop trigger if exists zz_bar_finished_products_direct_write_guard on public.finished_products;
create trigger zz_bar_finished_products_direct_write_guard before insert or update or delete on public.finished_products for each row execute function public.bar_guard_finished_product_direct_write();

create or replace function public.bar_guard_inventory_item_direct_write()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_company uuid; v_is_bar boolean:=false;
begin
 if tg_op='DELETE' then
  v_company:=old.company_id;
  v_is_bar:=upper(coalesce(old.subcategory,''))='BAR' or upper(coalesce(old.notes,'')) like '%IDEALO BAR%';
 else
  v_company:=new.company_id;
  v_is_bar:=upper(coalesce(new.subcategory,''))='BAR' or upper(coalesce(new.notes,'')) like '%IDEALO BAR%';
  if tg_op='UPDATE' then v_is_bar:=v_is_bar or upper(coalesce(old.subcategory,''))='BAR' or upper(coalesce(old.notes,'')) like '%IDEALO BAR%'; end if;
 end if;
 if auth.uid() is null or pg_trigger_depth()>1 or not v_is_bar then return case when tg_op='DELETE' then old else new end; end if;
 if public.bar_has_permission(v_company,'inventory.manage') or public.bar_has_permission(v_company,'admin.manage') then return case when tg_op='DELETE' then old else new end; end if;
 raise exception 'Tu rol no puede modificar directamente el inventario de IDEALO BAR.';
end;$$;
revoke execute on function public.bar_guard_inventory_item_direct_write() from public, anon, authenticated;
drop trigger if exists zz_bar_inventory_items_direct_write_guard on public.inventory_items;
create trigger zz_bar_inventory_items_direct_write_guard before insert or update or delete on public.inventory_items for each row execute function public.bar_guard_inventory_item_direct_write();

create or replace function public.bar_prevent_reservation_overlap()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_conflict text;
begin
 if new.table_id is null or new.status not in ('pending','confirmed','seated') then return new; end if;
 select r.customer_name into v_conflict from public.bar_reservations r
 where r.company_id=new.company_id and r.table_id=new.table_id and r.id<>new.id and r.status in ('pending','confirmed','seated')
   and r.reserved_for < new.reserved_for + make_interval(mins=>coalesce(new.duration_minutes,120))
   and r.reserved_for + make_interval(mins=>coalesce(r.duration_minutes,120)) > new.reserved_for
 order by r.reserved_for limit 1;
 if v_conflict is not null then raise exception 'La mesa ya tiene una reserva que se cruza con este horario.'; end if;
 return new;
end;$$;
revoke execute on function public.bar_prevent_reservation_overlap() from public, anon, authenticated;
drop trigger if exists bar_reservations_overlap_guard on public.bar_reservations;
create trigger bar_reservations_overlap_guard before insert or update of table_id,reserved_for,duration_minutes,status on public.bar_reservations for each row execute function public.bar_prevent_reservation_overlap();

create or replace function public.bar_refresh_menu_popularity(p_company_id uuid)
returns jsonb language plpgsql set search_path to 'public' as $$
declare v_updated integer:=0;
begin
 if auth.uid() is not null and not public.bar_has_permission(p_company_id,'catalog.manage') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede recalcular el orden de la carta.'; end if;
 with sales as (
  select i.product_id,coalesce(sum(i.quantity),0)::numeric qty,coalesce(sum(i.line_total),0)::numeric sales
  from public.bar_order_items i join public.bar_orders o on o.id=i.order_id and o.company_id=i.company_id
  where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=now()-interval '90 days'
  group by i.product_id
 )
 update public.bar_menu_items m
 set sort_order=case when coalesce(s.qty,0)>0 then -least(2000000000,(round(s.qty*1000)+least(round(s.sales),999))::integer) else greatest(coalesce(m.sort_order,1000),1000) end,updated_at=now()
 from (select m2.id,s2.qty,s2.sales from public.bar_menu_items m2 left join sales s2 on s2.product_id=m2.product_id where m2.company_id=p_company_id) s
 where m.id=s.id and m.company_id=p_company_id;
 get diagnostics v_updated=row_count;
 return jsonb_build_object('company_id',p_company_id,'updated',v_updated,'window_days',90,'message','Carta reordenada: los productos más consumidos aparecen primero.');
end;$$;
revoke execute on function public.bar_refresh_menu_popularity(uuid) from public, anon;
grant execute on function public.bar_refresh_menu_popularity(uuid) to authenticated;

create or replace function public.bar_autorank_menu_after_paid()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
 if old.status is distinct from 'paid' and new.status='paid' then
  with affected as (select distinct product_id from public.bar_order_items where order_id=new.id and status<>'cancelled'),
  sales as (
   select i.product_id,coalesce(sum(i.quantity),0)::numeric qty,coalesce(sum(i.line_total),0)::numeric sales
   from public.bar_order_items i join public.bar_orders o on o.id=i.order_id and o.company_id=i.company_id
   where i.company_id=new.company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=now()-interval '90 days' and i.product_id in (select product_id from affected)
   group by i.product_id
  )
  update public.bar_menu_items m set sort_order=-least(2000000000,(round(s.qty*1000)+least(round(s.sales),999))::integer),updated_at=now()
  from sales s where m.company_id=new.company_id and m.product_id=s.product_id;
 end if;
 return new;
end;$$;
revoke execute on function public.bar_autorank_menu_after_paid() from public, anon, authenticated;
drop trigger if exists bar_orders_autorank_menu_after_paid on public.bar_orders;
create trigger bar_orders_autorank_menu_after_paid after update of status on public.bar_orders for each row execute function public.bar_autorank_menu_after_paid();

create index if not exists bar_orders_company_paid_closed_idx on public.bar_orders(company_id,closed_at desc) where status='paid';
create index if not exists bar_order_items_company_product_created_idx on public.bar_order_items(company_id,product_id,created_at desc) where status<>'cancelled';
create index if not exists bar_menu_items_company_active_category_sort_idx on public.bar_menu_items(company_id,active,category,sort_order);
create index if not exists bar_payments_company_created_method_idx on public.bar_payments(company_id,created_at desc,method);
create index if not exists bar_reservations_company_status_time_idx on public.bar_reservations(company_id,status,reserved_for);
create index if not exists bar_print_jobs_company_status_created_idx on public.bar_print_jobs(company_id,status,created_at desc);

create or replace function public.bar_release_health(p_company_id uuid)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare v_readiness jsonb;v_runtime jsonb;v_integrity jsonb;v_security jsonb;v_operations jsonb;v_critical integer:=0;v_warnings integer:=0;v_score integer:=100;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede consultar la salud integral del sistema.'; end if;
 v_readiness:=public.bar_commercial_readiness(p_company_id);
 v_runtime:=public.bar_runtime_audit(p_company_id);
 v_integrity:=jsonb_build_object(
  'duplicate_active_table_orders',(select count(*) from (select table_id from public.bar_orders where company_id=p_company_id and table_id is not null and status not in ('paid','cancelled') group by table_id having count(*)>1)x),
  'paid_total_mismatch',(select count(*) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and abs(coalesce((select sum(p.amount) from public.bar_payments p where p.order_id=o.id),0)-o.total)>0.01),
  'overpaid_orders',(select count(*) from public.bar_orders o where o.company_id=p_company_id and coalesce((select sum(p.amount) from public.bar_payments p where p.order_id=o.id),0)>o.total+0.01),
  'available_table_with_open_order',(select count(*) from public.bar_tables t where t.company_id=p_company_id and t.status='available' and exists(select 1 from public.bar_orders o where o.table_id=t.id and o.status not in ('paid','cancelled'))),
  'busy_table_without_open_order',(select count(*) from public.bar_tables t where t.company_id=p_company_id and t.status in ('occupied','awaiting_payment') and not exists(select 1 from public.bar_orders o where o.table_id=t.id and o.status not in ('paid','cancelled'))),
  'orphan_payments',(select count(*) from public.bar_payments p left join public.bar_orders o on o.id=p.order_id and o.company_id=p.company_id where p.company_id=p_company_id and o.id is null),
  'invalid_payments',(select count(*) from public.bar_payments p where p.company_id=p_company_id and (p.amount<=0 or p.method not in ('cash','card','transfer','other'))),
  'broken_menu_products',(select count(*) from public.bar_menu_items m left join public.finished_products p on p.id=m.product_id and p.company_id=m.company_id where m.company_id=p_company_id and m.active=true and (p.id is null or p.active=false)),
  'active_menu_without_price',(select count(*) from public.bar_menu_items m join public.finished_products p on p.id=m.product_id where m.company_id=p_company_id and m.active=true and coalesce(m.sale_price_override,p.sale_price,0)<=0),
  'active_menu_without_recipe',(select count(*) from public.bar_menu_items m where m.company_id=p_company_id and m.active=true and not exists(select 1 from public.bar_recipe_components r where r.company_id=m.company_id and r.product_id=m.product_id and r.active=true)),
  'broken_recipe_inventory',(select count(*) from public.bar_recipe_components r left join public.inventory_items i on i.id=r.inventory_item_id and i.company_id=r.company_id where r.company_id=p_company_id and r.active=true and (i.id is null or i.active=false or i.deleted_at is not null)),
  'negative_inventory',(select count(*) from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null and i.current_stock<0),
  'negative_location_stock',(select count(*) from public.bar_inventory_location_stock s where s.company_id=p_company_id and s.quantity<0),
  'pending_cash_postings',(select count(*) from public.bar_payments p where p.company_id=p_company_id and p.financial_posting_status<>'posted'),
  'stale_print_jobs',(select count(*) from public.bar_print_jobs j where j.company_id=p_company_id and j.status='PENDING' and j.created_at<now()-interval '15 minutes'),
  'rejected_dte',(select count(*) from public.dte_documents d where d.company_id=p_company_id and d.bar_order_id is not null and d.status='REJECTED')
 );
 v_security:=jsonb_build_object(
  'bar_tables_without_rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'bar_%' and not c.relrowsecurity),
  'bar_policies_for_anon',(select count(*) from pg_policies where schemaname='public' and tablename like 'bar_%' and roles::text like '%anon%'),
  'bar_functions_executable_by_anon',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'bar_%' and has_function_privilege('anon',p.oid,'EXECUTE')),
  'direct_product_guard',exists(select 1 from pg_trigger where tgname='zz_bar_finished_products_direct_write_guard' and not tgisinternal),
  'direct_inventory_guard',exists(select 1 from pg_trigger where tgname='zz_bar_inventory_items_direct_write_guard' and not tgisinternal),
  'reservation_overlap_guard',exists(select 1 from pg_trigger where tgname='bar_reservations_overlap_guard' and not tgisinternal),
  'automatic_menu_rank',exists(select 1 from pg_trigger where tgname='bar_orders_autorank_menu_after_paid' and not tgisinternal)
 );
 v_operations:=jsonb_build_object(
  'active_tables',(select count(*) from public.bar_tables where company_id=p_company_id and active=true),
  'active_menu_items',(select count(*) from public.bar_menu_items where company_id=p_company_id and active=true),
  'open_orders',(select count(*) from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled')),
  'open_cash_sessions',(select count(*) from public.cash_register_sessions where company_id=p_company_id and upper(status)='OPEN'),
  'pending_print_jobs',(select count(*) from public.bar_print_jobs where company_id=p_company_id and status='PENDING'),
  'today_paid_orders',(select count(*) from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date),
  'today_sales',(select coalesce(sum(total),0) from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date)
 );
 v_critical:=coalesce((v_integrity->>'duplicate_active_table_orders')::int,0)+coalesce((v_integrity->>'paid_total_mismatch')::int,0)+coalesce((v_integrity->>'overpaid_orders')::int,0)+coalesce((v_integrity->>'orphan_payments')::int,0)+coalesce((v_integrity->>'invalid_payments')::int,0)+coalesce((v_integrity->>'broken_menu_products')::int,0)+coalesce((v_integrity->>'active_menu_without_price')::int,0)+coalesce((v_integrity->>'active_menu_without_recipe')::int,0)+coalesce((v_integrity->>'broken_recipe_inventory')::int,0)+coalesce((v_integrity->>'negative_inventory')::int,0)+coalesce((v_integrity->>'negative_location_stock')::int,0)+coalesce((v_security->>'bar_tables_without_rls')::int,0)+coalesce((v_security->>'bar_policies_for_anon')::int,0)+coalesce((v_security->>'bar_functions_executable_by_anon')::int,0);
 v_warnings:=coalesce((v_integrity->>'available_table_with_open_order')::int,0)+coalesce((v_integrity->>'busy_table_without_open_order')::int,0)+coalesce((v_integrity->>'pending_cash_postings')::int,0)+coalesce((v_integrity->>'stale_print_jobs')::int,0)+coalesce((v_integrity->>'rejected_dte')::int,0);
 v_score:=greatest(0,100-least(80,v_critical*8)-least(20,v_warnings*2));
 return jsonb_build_object('score',v_score,'healthy',v_critical=0,'critical_issues',v_critical,'warnings',v_warnings,'readiness',v_readiness,'runtime',v_runtime,'integrity',v_integrity,'security',v_security,'operations',v_operations,'checked_at',now());
end;$$;
revoke execute on function public.bar_release_health(uuid) from public, anon;
grant execute on function public.bar_release_health(uuid) to authenticated;

do $$
declare r record;
begin
 for r in select distinct company_id from public.bar_menu_items loop
  perform set_config('request.jwt.claim.sub','',true);
  perform public.bar_refresh_menu_popularity(r.company_id);
 end loop;
end $$;
