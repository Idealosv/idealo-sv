create or replace function public.bar_guard_print_job_write()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid; v_station text;
begin
 v_company:=case when tg_op='DELETE' then old.company_id else new.company_id end; v_station:=case when tg_op='DELETE' then old.station else new.station end;
 if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
 if public.bar_has_permission(v_company,'admin.manage') then return case when tg_op='DELETE' then old else new end; end if;
 if v_station='kitchen' and not public.bar_has_permission(v_company,'kitchen.advance') and not public.bar_has_permission(v_company,'order.send') then raise exception 'Sin permiso para la cola de Cocina.'; end if;
 if v_station='bar' and not public.bar_has_permission(v_company,'bar.advance') and not public.bar_has_permission(v_company,'order.send') then raise exception 'Sin permiso para la cola de Barra.'; end if;
 if v_station='cashier' and not public.bar_has_permission(v_company,'payment.take') then raise exception 'Sin permiso para tickets de Caja.'; end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
drop trigger if exists bar_print_jobs_role_guard on public.bar_print_jobs;
create trigger bar_print_jobs_role_guard before insert or update or delete on public.bar_print_jobs for each row execute function public.bar_guard_print_job_write();