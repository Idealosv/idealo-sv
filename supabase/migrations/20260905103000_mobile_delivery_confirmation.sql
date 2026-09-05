drop function if exists public.mobile_confirm_delivery(uuid,text,timestamptz,text,text);

create or replace function public.mobile_confirm_delivery(
  p_work_order_id uuid,
  p_recipient_name text,
  p_delivery_method text default 'DELIVERY',
  p_notes text default null
)
returns public.deliveries
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.work_orders;
  v_delivery public.deliveries;
  v_role public.company_role;
  v_employee uuid;
  v_recipient text;
begin
  select * into v_order
  from public.work_orders
  where id=p_work_order_id
  for update;

  if v_order.id is null then
    raise exception 'Orden no encontrada';
  end if;

  if v_order.status not in ('READY','DELIVERED') then
    raise exception 'La OT debe estar LISTA antes de confirmar la entrega';
  end if;

  select role into v_role
  from public.company_members
  where company_id=v_order.company_id and user_id=auth.uid();

  if v_role is null or v_role='viewer' then
    raise exception 'Sin permiso para confirmar la entrega';
  end if;

  if v_role='staff' then
    select id into v_employee
    from public.employees
    where company_id=v_order.company_id and user_id=auth.uid() and active=true
    limit 1;

    if v_employee is null or not exists(
      select 1
      from public.production_schedule_events e
      join public.production_schedule_assignments a on a.event_id=e.id
      where e.work_order_id=v_order.id and a.employee_id=v_employee
    ) then
      raise exception 'La orden no está asignada a este empleado';
    end if;
  end if;

  v_recipient:=nullif(btrim(coalesce(p_recipient_name,'')),'');
  if v_recipient is null then
    raise exception 'Indicá el nombre de quien recibe';
  end if;

  if p_delivery_method not in ('PICKUP','DELIVERY','INSTALLATION') then
    raise exception 'Modalidad de entrega no permitida';
  end if;

  insert into public.deliveries(
    company_id,work_order_id,client_id,status,delivery_method,
    delivered_at,recipient_name,notes,updated_at
  ) values (
    v_order.company_id,v_order.id,v_order.client_id,'DELIVERED',p_delivery_method,
    now(),v_recipient,nullif(btrim(coalesce(p_notes,'')),''),now()
  )
  on conflict (work_order_id) where work_order_id is not null
  do update set
    client_id=coalesce(public.deliveries.client_id,excluded.client_id),
    status='DELIVERED',
    delivery_method=excluded.delivery_method,
    delivered_at=coalesce(public.deliveries.delivered_at,excluded.delivered_at),
    recipient_name=excluded.recipient_name,
    notes=coalesce(excluded.notes,public.deliveries.notes),
    updated_at=now()
  returning * into v_delivery;

  update public.work_orders
  set status='DELIVERED',
      delivered_at=coalesce(delivered_at,v_delivery.delivered_at,now()),
      updated_at=now()
  where id=v_order.id;

  return v_delivery;
end
$$;

revoke all on function public.mobile_confirm_delivery(uuid,text,text,text) from public;
grant execute on function public.mobile_confirm_delivery(uuid,text,text,text) to authenticated;

comment on function public.mobile_confirm_delivery(uuid,text,text,text)
is 'Confirma entrega móvil de una OT READY/DELIVERED, valida rol/asignación y sincroniza delivery + OT.';
