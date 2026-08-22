alter table public.employees add column if not exists user_id uuid null references auth.users(id) on delete set null;
create unique index if not exists employees_company_user_uidx on public.employees(company_id,user_id) where user_id is not null;
create index if not exists employees_user_id_idx on public.employees(user_id);
comment on column public.employees.user_id is 'Usuario Supabase vinculado al empleado para experiencia móvil por rol/asignación.';

create or replace function public.mobile_set_work_order_status(p_work_order_id uuid,p_status text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare v_order public.work_orders; v_role public.company_role; v_employee uuid;
begin
 select * into v_order from public.work_orders where id=p_work_order_id;
 if v_order.id is null then raise exception 'Orden no encontrada'; end if;
 select role into v_role from public.company_members where company_id=v_order.company_id and user_id=auth.uid();
 if v_role is null or v_role='viewer' then raise exception 'Sin permiso para actualizar la orden'; end if;
 if p_status not in ('PENDING','DESIGN','APPROVAL','PRODUCTION','READY','DELIVERED') then raise exception 'Estado no permitido'; end if;
 if v_role='staff' then
  select id into v_employee from public.employees where company_id=v_order.company_id and user_id=auth.uid() and active=true limit 1;
  if v_employee is null or not exists(select 1 from public.production_schedule_events e join public.production_schedule_assignments a on a.event_id=e.id where e.work_order_id=v_order.id and a.employee_id=v_employee) then raise exception 'La orden no está asignada a este empleado'; end if;
 end if;
 update public.work_orders set status=p_status,
  production_started_at=case when p_status='PRODUCTION' and production_started_at is null then now() else production_started_at end,
  ready_at=case when p_status='READY' and ready_at is null then now() else ready_at end,
  delivered_at=case when p_status='DELIVERED' and delivered_at is null then now() else delivered_at end,
  updated_at=now()
 where id=v_order.id returning * into v_order;
 return v_order;
end $$;
revoke all on function public.mobile_set_work_order_status(uuid,text) from public;
grant execute on function public.mobile_set_work_order_status(uuid,text) to authenticated;

create or replace function public.mobile_complete_schedule_event(p_event_id uuid)
returns public.production_schedule_events language plpgsql security definer set search_path=public as $$
declare v_event public.production_schedule_events; v_role public.company_role; v_employee uuid;
begin
 select * into v_event from public.production_schedule_events where id=p_event_id;
 if v_event.id is null then raise exception 'Actividad no encontrada'; end if;
 select role into v_role from public.company_members where company_id=v_event.company_id and user_id=auth.uid();
 if v_role is null or v_role='viewer' then raise exception 'Sin permiso para completar la actividad'; end if;
 if v_role='staff' then
  select id into v_employee from public.employees where company_id=v_event.company_id and user_id=auth.uid() and active=true limit 1;
  if v_employee is null or not exists(select 1 from public.production_schedule_assignments a where a.event_id=v_event.id and a.employee_id=v_employee) then raise exception 'La actividad no está asignada a este empleado'; end if;
 end if;
 update public.production_schedule_events set status='COMPLETED',updated_at=now() where id=v_event.id returning * into v_event;
 return v_event;
end $$;
revoke all on function public.mobile_complete_schedule_event(uuid) from public;
grant execute on function public.mobile_complete_schedule_event(uuid) to authenticated;
