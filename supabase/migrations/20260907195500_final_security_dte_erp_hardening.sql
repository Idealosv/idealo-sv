-- Endurecimiento final de seguridad SaaS, DTE y RPC operativas.
-- No habilita DTE de PRODUCCION ni modifica secretos.

-- 1) Los helpers de escritura administrativa/operativa respetan tambien el estado SaaS.
create or replace function public.erp_can_operate(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
set row_security='off'
as $$
  select coalesce(
    public.erp_company_role(p_company_id) in ('owner','admin','staff')
    and public.saas_company_operational_access(p_company_id),
    false
  )
$$;

create or replace function public.erp_can_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
set row_security='off'
as $$
  select coalesce(
    public.erp_company_role(p_company_id) in ('owner','admin')
    and public.saas_company_operational_access(p_company_id),
    false
  )
$$;

-- 2) Cotizacion rapida movil: rol + membresia operativa + cliente de la misma empresa.
create or replace function public.mobile_create_quick_quote(
  p_company_id uuid,
  p_client_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_valid_until date default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_quote uuid;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.erp_can_operate(p_company_id) then raise exception 'ERP_OPERATION_FORBIDDEN'; end if;
  if p_client_id is not null and not exists(
    select 1 from public.clients c where c.id=p_client_id and c.company_id=p_company_id
  ) then raise exception 'CLIENT_COMPANY_MISMATCH'; end if;
  if coalesce(trim(p_description),'')='' or p_quantity<=0 or p_unit_price<0 then
    raise exception 'Datos de cotizacion invalidos';
  end if;
  v_total=round(p_quantity*p_unit_price,2);
  insert into public.quotes(company_id,client_id,status,valid_until,notes,subtotal,discount,total)
  values(p_company_id,p_client_id,'DRAFT',p_valid_until,p_notes,v_total,0,v_total)
  returning id into v_quote;
  insert into public.quote_items(quote_id,description,quantity,unit,unit_price,discount,line_total,sort_order)
  values(v_quote,p_description,p_quantity,'unidad',p_unit_price,0,v_total,0);
  return v_quote;
end
$$;

-- 3) OT rapida movil: misma proteccion multiempresa y de membresia.
create or replace function public.mobile_create_quick_work_order(
  p_company_id uuid,
  p_client_id uuid,
  p_title text,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_due_at timestamptz default null,
  p_priority text default 'NORMAL'
) returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_order uuid;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.erp_can_operate(p_company_id) then raise exception 'ERP_OPERATION_FORBIDDEN'; end if;
  if p_client_id is not null and not exists(
    select 1 from public.clients c where c.id=p_client_id and c.company_id=p_company_id
  ) then raise exception 'CLIENT_COMPANY_MISMATCH'; end if;
  if coalesce(trim(p_title),'')='' or coalesce(trim(p_description),'')='' or p_quantity<=0 or p_unit_price<0 then
    raise exception 'Datos de OT invalidos';
  end if;
  if p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'Prioridad invalida'; end if;
  v_total=round(p_quantity*p_unit_price,2);
  insert into public.work_orders(company_id,client_id,status,title,due_at,total,priority,specifications,design_status)
  values(p_company_id,p_client_id,'PENDING',p_title,p_due_at,v_total,p_priority,p_description,'PENDING')
  returning id into v_order;
  insert into public.work_order_items(work_order_id,description,quantity,unit,unit_price,line_total,specifications,sort_order)
  values(v_order,p_description,p_quantity,'unidad',p_unit_price,v_total,p_description,0);
  return v_order;
end
$$;

-- 4) Cambios de estado moviles: no se permiten saltos arbitrarios ni operar una membresia bloqueada.
create or replace function public.mobile_set_work_order_status(p_work_order_id uuid,p_status text)
returns public.work_orders
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_order public.work_orders;
  v_role public.company_role;
  v_employee uuid;
  v_from text;
  v_progress numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_order from public.work_orders where id=p_work_order_id for update;
  if v_order.id is null then raise exception 'Orden no encontrada'; end if;
  if not public.saas_company_operational_access(v_order.company_id) then raise exception 'SAAS_SUBSCRIPTION_INACTIVE'; end if;
  select role into v_role from public.company_members where company_id=v_order.company_id and user_id=auth.uid();
  if v_role is null or v_role='viewer' then raise exception 'Sin permiso para actualizar la orden'; end if;
  if p_status not in ('PENDING','DESIGN','APPROVAL','PRODUCTION','READY','DELIVERED') then raise exception 'Estado no permitido'; end if;
  if v_role='staff' then
    select id into v_employee from public.employees where company_id=v_order.company_id and user_id=auth.uid() and active=true limit 1;
    if v_employee is null or not exists(
      select 1 from public.production_schedule_events e
      join public.production_schedule_assignments a on a.event_id=e.id
      where e.work_order_id=v_order.id and a.employee_id=v_employee
    ) then raise exception 'La orden no esta asignada a este empleado'; end if;
  end if;
  v_from:=v_order.status;
  if v_from=p_status then return v_order; end if;
  if not (
    (v_from='PENDING' and p_status='DESIGN') or
    (v_from='DESIGN' and p_status='APPROVAL') or
    (v_from in ('DESIGN','APPROVAL') and p_status='PRODUCTION') or
    (v_from='PRODUCTION' and p_status='READY') or
    (v_from='READY' and p_status='DELIVERED')
  ) then raise exception 'Transicion de produccion no permitida: % -> %',v_from,p_status; end if;
  v_progress:=case p_status
    when 'DESIGN' then greatest(coalesce(v_order.progress_percent,0),20)
    when 'APPROVAL' then greatest(coalesce(v_order.progress_percent,0),35)
    when 'PRODUCTION' then greatest(coalesce(v_order.progress_percent,0),50)
    when 'READY' then greatest(coalesce(v_order.progress_percent,0),90)
    when 'DELIVERED' then 100
    else coalesce(v_order.progress_percent,0)
  end;
  update public.work_orders
  set status=p_status,
      progress_percent=v_progress,
      production_started_at=case when p_status='PRODUCTION' then coalesce(production_started_at,now()) else production_started_at end,
      ready_at=case when p_status='READY' then coalesce(ready_at,now()) else ready_at end,
      delivered_at=case when p_status='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
      updated_at=now()
  where id=v_order.id returning * into v_order;
  insert into public.production_status_history(company_id,work_order_id,from_status,to_status,comment,changed_by)
  values(v_order.company_id,v_order.id,v_from,p_status,'Cambio desde app movil',auth.uid());
  return v_order;
end
$$;

-- 5) Aprobacion de diseno tambien queda sometida al estado de la membresia.
create or replace function public.mobile_set_design_decision(p_work_order_id uuid,p_decision text,p_comments text default null)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select company_id into v_company from public.work_orders where id=p_work_order_id;
  if v_company is null then raise exception 'OT no encontrada'; end if;
  if not public.saas_company_operational_access(v_company) then raise exception 'SAAS_SUBSCRIPTION_INACTIVE'; end if;
  select role::text into v_role from public.company_members where company_id=v_company and user_id=auth.uid();
  if v_role not in ('owner','admin','staff') then raise exception 'Sin permiso'; end if;
  if p_decision not in ('APPROVED','CHANGES_REQUESTED') then raise exception 'Decision invalida'; end if;
  insert into public.design_approvals(company_id,work_order_id,status,comments,approved_by,approved_at)
  values(v_company,p_work_order_id,p_decision,p_comments,auth.uid(),now())
  on conflict(work_order_id) do update
    set status=excluded.status,comments=excluded.comments,approved_by=auth.uid(),approved_at=now(),updated_at=now();
  update public.work_orders
  set design_status=p_decision,
      client_approval_at=case when p_decision='APPROVED' then now() else null end,
      status=case when p_decision='APPROVED' and status in ('DESIGN','APPROVAL') then 'PRODUCTION' else status end,
      updated_at=now()
  where id=p_work_order_id;
end
$$;

-- 6) Numeracion DTE: valida empresa, plan y PRODUCCION antes de consumir secuencia.
create or replace function public.next_dte_control_number(
  p_company_id uuid,
  p_dte_type text,
  p_environment text default 'test'
) returns text
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_value bigint;
  v_local_max bigint;
  v_establishment text;
  v_pos text;
  v_role text;
  v_demo boolean:=false;
  v_service_role boolean:=coalesce(auth.role(),'')='service_role';
  v_has_subscription boolean:=false;
  v_dte_allowed boolean:=false;
  v_runtime_ok boolean:=false;
begin
  if p_dte_type not in ('01','03') then raise exception 'DTE_TYPE_INVALID'; end if;
  if p_environment not in ('test','production') then raise exception 'DTE_ENVIRONMENT_INVALID'; end if;
  if auth.uid() is null and not v_service_role then raise exception 'AUTH_REQUIRED'; end if;

  select coalesce(c.demo_mode,false),coalesce(nullif(c.establishment_code,''),'M001'),coalesce(nullif(c.point_of_sale_code,''),'P001')
  into v_demo,v_establishment,v_pos
  from public.companies c where c.id=p_company_id;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;

  if not v_service_role then
    select lower(cm.role::text) into v_role
    from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid();
    if v_role not in ('owner','admin') then raise exception 'DTE_ROLE_FORBIDDEN'; end if;
    if p_environment='production' and v_role<>'owner' then raise exception 'DTE_PRODUCTION_OWNER_REQUIRED'; end if;
  end if;

  select true,
         coalesce(p.dte_enabled,false)
         and (s.status in ('trial','active') or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at>=now()))
  into v_has_subscription,v_dte_allowed
  from public.saas_company_subscriptions s
  join public.saas_plans p on p.id=s.plan_id
  where s.company_id=p_company_id
  limit 1;

  if coalesce(v_has_subscription,false) and not coalesce(v_dte_allowed,false) then
    raise exception 'SAAS_DTE_PLAN_REQUIRED';
  end if;

  if p_environment='production' then
    if v_demo then raise exception 'DEMO_DTE_PRODUCTION_FORBIDDEN'; end if;
    select exists(
      select 1 from public.dte_runtime_settings r
      where r.company_id=p_company_id
        and r.environment='production'
        and r.production_enabled=true
        and r.production_approved=true
    ) into v_runtime_ok;
    if not v_runtime_ok then raise exception 'DTE_PRODUCTION_NOT_APPROVED'; end if;
  else
    v_establishment:='M001';
    v_pos:='P001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text||':'||p_dte_type||':'||p_environment));
  select coalesce(max((split_part(control_number,'-',4))::bigint),0)
  into v_local_max
  from public.dte_documents
  where company_id=p_company_id and dte_type=p_dte_type and environment=p_environment
    and split_part(control_number,'-',4) ~ '^[0-9]{15}$';

  insert into public.dte_control_sequences(company_id,dte_type,environment,last_value)
  values(p_company_id,p_dte_type,p_environment,v_local_max+1)
  on conflict(company_id,dte_type,environment)
  do update set last_value=greatest(public.dte_control_sequences.last_value,v_local_max)+1,updated_at=now()
  returning last_value into v_value;

  return format('DTE-%s-%s%s-%s',p_dte_type,v_establishment,v_pos,lpad(v_value::text,15,'0'));
end
$$;

revoke all on function public.next_dte_control_number(uuid,text,text) from public,anon;
grant execute on function public.next_dte_control_number(uuid,text,text) to authenticated,service_role;
