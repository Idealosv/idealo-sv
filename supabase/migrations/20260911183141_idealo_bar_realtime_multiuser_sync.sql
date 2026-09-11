-- IDEALO BAR · sincronización multiusuario en tiempo real

do $$
declare v_table text;
begin
 foreach v_table in array array['bar_orders','bar_order_items','bar_tables','bar_payments','bar_reservations','bar_print_jobs','cash_register_sessions'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end$$;

alter table public.bar_orders replica identity full;
alter table public.bar_order_items replica identity full;
alter table public.bar_tables replica identity full;
alter table public.bar_payments replica identity full;
alter table public.bar_reservations replica identity full;
alter table public.bar_print_jobs replica identity full;
alter table public.cash_register_sessions replica identity full;

create or replace function public.bar_realtime_status(p_company_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare v_count integer;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'operation.access')
    and not public.bar_has_permission(p_company_id,'inventory.view')
    and not public.bar_has_permission(p_company_id,'admin.view')
    and not public.bar_has_permission(p_company_id,'admin.manage') then
  raise exception 'Sin acceso a IDEALO BAR.';
 end if;
 select count(*) into v_count from pg_publication_tables
 where pubname='supabase_realtime' and schemaname='public'
   and tablename=any(array['bar_orders','bar_order_items','bar_tables','bar_payments','bar_reservations','bar_print_jobs','cash_register_sessions']);
 return jsonb_build_object('enabled',v_count=7,'tables',v_count,'expected',7,'fallback_seconds',30);
end;
$$;
revoke execute on function public.bar_realtime_status(uuid) from public,anon;
grant execute on function public.bar_realtime_status(uuid) to authenticated;
