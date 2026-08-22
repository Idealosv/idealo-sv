-- App móvil: check-in/check-out del empleado vinculado y GPS opcional
alter table public.attendance_records add column if not exists check_in_lat numeric;
alter table public.attendance_records add column if not exists check_in_lng numeric;
alter table public.attendance_records add column if not exists check_in_accuracy_m numeric;
alter table public.attendance_records add column if not exists check_out_lat numeric;
alter table public.attendance_records add column if not exists check_out_lng numeric;
alter table public.attendance_records add column if not exists check_out_accuracy_m numeric;

create unique index if not exists attendance_records_employee_day_uidx
  on public.attendance_records(employee_id, work_date);

create or replace function public.mobile_attendance_action(
  p_action text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_m numeric default null
)
returns table(action text, work_date date, check_in time, check_out time)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_date date := (timezone('America/El_Salvador', now()))::date;
  v_time time := (timezone('America/El_Salvador', now()))::time;
  v_record public.attendance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if upper(p_action) not in ('CHECK_IN','CHECK_OUT') then raise exception 'Acción inválida'; end if;

  select e.* into v_employee
  from public.employees e
  join public.company_members cm on cm.company_id=e.company_id and cm.user_id=auth.uid()
  where e.user_id=auth.uid() and e.active=true
  limit 1;
  if v_employee.id is null then raise exception 'Usuario sin empleado activo vinculado'; end if;

  if upper(p_action)='CHECK_IN' then
    insert into public.attendance_records(company_id,employee_id,work_date,check_in,status,check_in_lat,check_in_lng,check_in_accuracy_m)
    values(v_employee.company_id,v_employee.id,v_date,v_time,'PRESENT',p_lat,p_lng,p_accuracy_m)
    on conflict(employee_id,work_date) do update set
      check_in=coalesce(attendance_records.check_in,excluded.check_in),
      status='PRESENT',
      check_in_lat=coalesce(attendance_records.check_in_lat,excluded.check_in_lat),
      check_in_lng=coalesce(attendance_records.check_in_lng,excluded.check_in_lng),
      check_in_accuracy_m=coalesce(attendance_records.check_in_accuracy_m,excluded.check_in_accuracy_m)
    returning * into v_record;
  else
    select * into v_record from public.attendance_records
      where employee_id=v_employee.id and work_date=v_date for update;
    if v_record.id is null or v_record.check_in is null then raise exception 'Primero debes registrar entrada'; end if;
    update public.attendance_records set
      check_out=v_time,
      check_out_lat=p_lat,
      check_out_lng=p_lng,
      check_out_accuracy_m=p_accuracy_m
    where id=v_record.id returning * into v_record;
  end if;

  return query select upper(p_action),v_record.work_date,v_record.check_in,v_record.check_out;
end;
$$;

revoke all on function public.mobile_attendance_action(text,numeric,numeric,numeric) from public, anon;
grant execute on function public.mobile_attendance_action(text,numeric,numeric,numeric) to authenticated;
