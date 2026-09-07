-- Guardia de escritura a nivel tabla. Los triggers se ejecutan incluso cuando una RPC
-- SECURITY DEFINER omite RLS, evitando que una membresia suspendida opere por una ruta privilegiada.
create or replace function public.saas_enforce_operational_write()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company uuid;
begin
  v_company:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  if not public.saas_company_operational_access(v_company) then
    raise exception 'SAAS_SUBSCRIPTION_INACTIVE';
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$$;

revoke all on function public.saas_enforce_operational_write() from public,anon,authenticated;
grant execute on function public.saas_enforce_operational_write() to service_role,postgres;

do $$
declare
  v_table text;
  v_tables text[]:=array[
    'clients',
    'quotes',
    'work_orders',
    'attendance_records',
    'production_schedule_events',
    'deliveries',
    'design_approvals'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.'||v_table) is not null then
      execute format('drop trigger if exists trg_saas_operational_write_guard on public.%I',v_table);
      execute format(
        'create trigger trg_saas_operational_write_guard before insert or update or delete on public.%I for each row execute function public.saas_enforce_operational_write()',
        v_table
      );
    end if;
  end loop;
end
$$;
