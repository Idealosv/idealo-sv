create or replace function public.mobile_confirm_delivery(
  p_work_order_id uuid,
  p_recipient_name text,
  p_delivered_at timestamptz default now(),
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

  select role into v_role
  from public.company_members
  where company_id=v_order.company_id and user_id=auth.uid();

  if v_role is null or v_role='viewer' then
    raise exception 'Sin permiso para confirmar la entrega';
  end if;

  if v_order.status not in ('READY','DELIVERED') then
    raise exception 'La OT debe estar lista antes de confirmar la entrega';
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
    raise exception 'Indicá quién recibe la entrega';
  end if;

  if p_delivery_method not in ('PICKUP','DELIVERY','INSTALLATION') then
    raise exception 'Método de entrega no permitido';
  end if;

  select * into v_delivery
  from public.deliveries
  where work_order_id=v_order.id
  for update;

  if v_delivery.id is null then
    insert into public.deliveries(
      company_id,work_order_id,client_id,status,delivery_method,
      delivered_at,recipient_name,notes,updated_at
    ) values (
      v_order.company_id,v_order.id,v_order.client_id,'DELIVERED',p_delivery_method,
      coalesce(p_delivered_at,now()),v_recipient,nullif(btrim(coalesce(p_notes,'')),''),now()
    ) returning * into v_delivery;
  else
    if v_delivery.status='CANCELLED' then
      raise exception 'La entrega asociada está cancelada';
    end if;
    update public.deliveries
    set status='DELIVERED',
        delivery_method=p_delivery_method,
        delivered_at=coalesce(p_delivered_at,delivered_at,now()),
        recipient_name=v_recipient,
        notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
        updated_at=now()
    where id=v_delivery.id
    returning * into v_delivery;
  end if;

  update public.work_orders
  set status='DELIVERED',
      delivered_at=coalesce(delivered_at,v_delivery.delivered_at,now()),
      updated_at=now()
  where id=v_order.id;

  return v_delivery;
end
$$;

revoke all on function public.mobile_confirm_delivery(uuid,text,timestamptz,text,text) from public;
grant execute on function public.mobile_confirm_delivery(uuid,text,timestamptz,text,text) to authenticated;

comment on function public.mobile_confirm_delivery(uuid,text,timestamptz,text,text)
is 'Confirma entrega móvil de una OT READY/DELIVERED, valida rol/asignación y sincroniza delivery + OT.';
