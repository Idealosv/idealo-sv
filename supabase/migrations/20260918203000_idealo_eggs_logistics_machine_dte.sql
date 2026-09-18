-- IDEALO Eggs: logística, despacho, integración de clasificadora y trazabilidad DTE.

alter table public.egg_customers
  add column if not exists erp_client_id uuid references public.clients(id) on delete set null,
  add column if not exists nit text,
  add column if not exists nrc text,
  add column if not exists business_activity text,
  add column if not exists activity_code text,
  add column if not exists department text,
  add column if not exists department_code text,
  add column if not exists municipality text,
  add column if not exists municipality_code text,
  add column if not exists district_code text,
  add column if not exists preferred_dte_type text not null default '01',
  add column if not exists taxpayer_type text not null default '2';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.egg_customers'::regclass
      and conname='egg_customers_preferred_dte_type_check'
  ) then
    alter table public.egg_customers
      add constraint egg_customers_preferred_dte_type_check
      check (preferred_dte_type in ('01','03'));
  end if;
end $$;

create table if not exists public.egg_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_code text not null,
  route_date date not null default current_date,
  name text not null default '',
  driver_name text not null default '',
  vehicle text not null default '',
  status text not null default 'PLANNED'
    check(status in ('PLANNED','IN_TRANSIT','COMPLETED','CANCELLED')),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,route_code)
);

create table if not exists public.egg_route_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.egg_routes(id) on delete cascade,
  order_id uuid not null references public.egg_orders(id) on delete cascade,
  stop_order integer not null default 1,
  status text not null default 'PENDING'
    check(status in ('PENDING','DELIVERED','FAILED')),
  delivered_at timestamptz,
  received_by text not null default '',
  collected_amount numeric(14,2) not null default 0 check(collected_amount>=0),
  collection_method text,
  collection_reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(route_id,order_id)
);

create table if not exists public.egg_machine_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  protocol text not null default 'CSV'
    check(protocol in ('CSV','SERIAL','API','MANUAL')),
  baud_rate integer not null default 9600 check(baud_rate>0),
  data_format text not null default 'WEIGHT,QUALITY,UV',
  active boolean not null default true,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,name)
);

create table if not exists public.egg_machine_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid not null references public.egg_batches(id) on delete cascade,
  device_id uuid references public.egg_machine_devices(id) on delete set null,
  source text not null default 'CSV',
  rows_received integer not null default 0,
  rows_accepted integer not null default 0,
  rows_rejected integer not null default 0,
  status text not null default 'COMPLETED'
    check(status in ('PROCESSING','COMPLETED','FAILED')),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.egg_weight_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.egg_machine_imports(id) on delete cascade,
  batch_id uuid not null references public.egg_batches(id) on delete cascade,
  device_id uuid references public.egg_machine_devices(id) on delete set null,
  sequence_no integer not null,
  weight_g numeric(8,2) not null check(weight_g>0),
  quality_status text not null default 'GOOD'
    check(quality_status in ('GOOD','DAMAGED')),
  uv_status text not null default 'UNKNOWN'
    check(uv_status in ('PASS','FAIL','UNKNOWN')),
  grade_id uuid not null references public.egg_grades(id),
  raw_line text not null default '',
  created_at timestamptz not null default now(),
  unique(import_id,sequence_no)
);

create table if not exists public.egg_order_dte_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.egg_orders(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  dte_type text not null check(dte_type in ('01','03')),
  environment text not null check(environment in ('test','production')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique(order_id,dte_document_id)
);

create index if not exists egg_routes_company_date_idx on public.egg_routes(company_id,route_date desc);
create index if not exists egg_route_stops_route_idx on public.egg_route_stops(route_id,stop_order);
create index if not exists egg_machine_devices_company_idx on public.egg_machine_devices(company_id,active);
create index if not exists egg_machine_imports_batch_idx on public.egg_machine_imports(batch_id,created_at desc);
create index if not exists egg_weight_events_batch_idx on public.egg_weight_events(batch_id,created_at desc);
create index if not exists egg_order_dte_links_order_idx on public.egg_order_dte_links(order_id,created_at desc);

alter table public.egg_routes enable row level security;
alter table public.egg_route_stops enable row level security;
alter table public.egg_machine_devices enable row level security;
alter table public.egg_machine_imports enable row level security;
alter table public.egg_weight_events enable row level security;
alter table public.egg_order_dte_links enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'egg_routes','egg_route_stops','egg_machine_devices',
    'egg_machine_imports','egg_weight_events','egg_order_dte_links'
  ]
  loop
    execute format('drop policy if exists egg_member_select on public.%I',t);
    execute format('drop policy if exists egg_member_insert on public.%I',t);
    execute format('drop policy if exists egg_member_update on public.%I',t);
    execute format('drop policy if exists egg_member_delete on public.%I',t);
    execute format('create policy egg_member_select on public.%I for select to authenticated using (public.egg_company_member(company_id))',t);
    execute format('create policy egg_member_insert on public.%I for insert to authenticated with check (public.egg_company_member(company_id))',t);
    execute format('create policy egg_member_update on public.%I for update to authenticated using (public.egg_company_member(company_id)) with check (public.egg_company_member(company_id))',t);
    execute format('create policy egg_member_delete on public.%I for delete to authenticated using (public.egg_company_member(company_id))',t);
  end loop;
end $$;

grant select,insert,update,delete on
  public.egg_routes,public.egg_route_stops,public.egg_machine_devices,
  public.egg_machine_imports,public.egg_weight_events,public.egg_order_dte_links
to authenticated;

grant all privileges on
  public.egg_routes,public.egg_route_stops,public.egg_machine_devices,
  public.egg_machine_imports,public.egg_weight_events,public.egg_order_dte_links
to service_role;

create or replace function public.egg_grade_for_weight(p_company_id uuid,p_weight_g numeric)
returns uuid
language sql
stable
security definer
set search_path='public'
as $$
  select g.id
  from public.egg_grades g
  where g.company_id=p_company_id
    and g.active=true
    and (g.min_weight_g is null or p_weight_g>=g.min_weight_g)
    and (g.max_weight_g is null or p_weight_g<=g.max_weight_g)
  order by g.sort_order
  limit 1
$$;

revoke all on function public.egg_grade_for_weight(uuid,numeric) from public;
grant execute on function public.egg_grade_for_weight(uuid,numeric) to authenticated,service_role;

create or replace function public.egg_create_route(
  p_company_id uuid,
  p_route_date date,
  p_name text default '',
  p_driver_name text default '',
  p_vehicle text default '',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_id uuid; v_code text;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  v_id:=gen_random_uuid();
  v_code:='R-'||to_char(coalesce(p_route_date,current_date),'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,5));
  insert into public.egg_routes(id,company_id,route_code,route_date,name,driver_name,vehicle,notes,created_by)
  values(v_id,p_company_id,v_code,coalesce(p_route_date,current_date),coalesce(p_name,''),coalesce(p_driver_name,''),coalesce(p_vehicle,''),coalesce(p_notes,''),auth.uid());
  return v_id;
end;
$$;

create or replace function public.egg_add_order_to_route(p_route_id uuid,p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_route public.egg_routes%rowtype; v_order public.egg_orders%rowtype; v_id uuid; v_stop integer;
begin
  select * into v_route from public.egg_routes where id=p_route_id;
  if not found then raise exception 'Ruta no encontrada.'; end if;
  if not public.egg_company_member(v_route.company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if v_route.status<>'PLANNED' then raise exception 'Solo se pueden agregar pedidos a una ruta planificada.'; end if;
  select * into v_order from public.egg_orders where id=p_order_id and company_id=v_route.company_id;
  if not found or v_order.status='CANCELLED' then raise exception 'Pedido inválido para esta ruta.'; end if;
  if exists(select 1 from public.egg_route_stops where order_id=p_order_id and status in ('PENDING','DELIVERED')) then
    raise exception 'El pedido ya está asignado a una ruta.';
  end if;
  select coalesce(max(stop_order),0)+1 into v_stop from public.egg_route_stops where route_id=p_route_id;
  insert into public.egg_route_stops(company_id,route_id,order_id,stop_order)
  values(v_route.company_id,p_route_id,p_order_id,v_stop)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.egg_start_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_routes where id=p_route_id;
  if v_company is null then raise exception 'Ruta no encontrada.'; end if;
  if not public.egg_company_member(v_company) then raise exception 'Sin acceso a la empresa.'; end if;
  if not exists(select 1 from public.egg_route_stops where route_id=p_route_id and status='PENDING') then
    raise exception 'Agregá al menos un pedido antes de iniciar la ruta.';
  end if;
  update public.egg_routes set status='IN_TRANSIT',updated_at=now()
  where id=p_route_id and status='PLANNED';
end;
$$;

create or replace function public.egg_record_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text default 'CASH',
  p_reference text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_order public.egg_orders%rowtype; v_id uuid; v_paid numeric; v_balance numeric;
begin
  select * into v_order from public.egg_orders where id=p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.egg_company_member(v_order.company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if v_order.status='CANCELLED' then raise exception 'No se puede abonar a un pedido cancelado.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El abono debe ser mayor que cero.'; end if;
  v_balance:=greatest(v_order.total-v_order.paid_amount,0);
  if p_amount>v_balance then raise exception 'El abono supera el saldo pendiente de %.',v_balance; end if;
  insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
  values(v_order.company_id,p_order_id,p_amount,
    case when upper(coalesce(p_method,'CASH')) in ('CASH','TRANSFER','CHECK','OTHER') then upper(p_method) else 'OTHER' end,
    coalesce(p_reference,''),auth.uid())
  returning id into v_id;
  v_paid:=v_order.paid_amount+p_amount;
  update public.egg_orders
  set paid_amount=v_paid,status=case when v_paid>=total then 'PAID' else status end,updated_at=now()
  where id=p_order_id;
  return v_id;
end;
$$;

create or replace function public.egg_deliver_route_stop(
  p_stop_id uuid,
  p_received_by text default '',
  p_collected_amount numeric default 0,
  p_collection_method text default 'CASH',
  p_collection_reference text default '',
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_stop public.egg_route_stops%rowtype; v_route_status text; v_pending integer;
begin
  select * into v_stop from public.egg_route_stops where id=p_stop_id;
  if not found then raise exception 'Parada no encontrada.'; end if;
  if not public.egg_company_member(v_stop.company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  select status into v_route_status from public.egg_routes where id=v_stop.route_id;
  if v_route_status not in ('PLANNED','IN_TRANSIT') then raise exception 'La ruta no admite entregas en su estado actual.'; end if;
  if v_stop.status='DELIVERED' then raise exception 'Esta entrega ya fue confirmada.'; end if;

  if coalesce(p_collected_amount,0)>0 then
    perform public.egg_record_payment(v_stop.order_id,p_collected_amount,p_collection_method,p_collection_reference);
  end if;

  update public.egg_route_stops
  set status='DELIVERED',delivered_at=now(),received_by=coalesce(p_received_by,''),
      collected_amount=coalesce(p_collected_amount,0),
      collection_method=case when coalesce(p_collected_amount,0)>0 then upper(coalesce(p_collection_method,'CASH')) else null end,
      collection_reference=coalesce(p_collection_reference,''),notes=coalesce(p_notes,''),updated_at=now()
  where id=p_stop_id;

  select count(*) into v_pending from public.egg_route_stops
  where route_id=v_stop.route_id and status='PENDING';

  if v_pending=0 then
    update public.egg_routes set status='COMPLETED',updated_at=now() where id=v_stop.route_id;
  elsif v_route_status='PLANNED' then
    update public.egg_routes set status='IN_TRANSIT',updated_at=now() where id=v_stop.route_id;
  end if;
end;
$$;

create or replace function public.egg_import_weight_events(
  p_company_id uuid,
  p_batch_id uuid,
  p_device_id uuid,
  p_entries jsonb,
  p_source text default 'CSV'
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_batch public.egg_batches%rowtype;
  v_import_id uuid;
  v_entry jsonb;
  v_weight numeric;
  v_quality text;
  v_uv text;
  v_raw text;
  v_grade uuid;
  v_index integer:=0;
  v_rows integer;
  v_used integer;
  v_good integer:=0;
  v_bad integer:=0;
  v_unit_cost numeric;
  v_current_total integer;
  v_current_avg numeric;
  v_new_total integer;
  r record;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  select * into v_batch from public.egg_batches where id=p_batch_id and company_id=p_company_id;
  if not found then raise exception 'Lote no encontrado.'; end if;
  if v_batch.status<>'OPEN' then raise exception 'El lote ya no está abierto para nuevas lecturas.'; end if;
  if p_device_id is not null and not exists(select 1 from public.egg_machine_devices where id=p_device_id and company_id=p_company_id and active=true) then
    raise exception 'Dispositivo inválido.';
  end if;
  if jsonb_typeof(p_entries)<>'array' then raise exception 'El archivo de pesos debe ser una lista.'; end if;

  v_rows:=jsonb_array_length(p_entries);
  if v_rows=0 then raise exception 'No hay lecturas para importar.'; end if;
  select coalesce(sum(quantity_eggs+damaged_eggs),0) into v_used
  from public.egg_batch_classifications where batch_id=p_batch_id;
  if v_used+v_rows>v_batch.total_eggs then
    raise exception 'La importación supera los huevos pendientes del lote. Pendientes: %.',v_batch.total_eggs-v_used;
  end if;

  insert into public.egg_machine_imports(company_id,batch_id,device_id,source,rows_received,status,created_by)
  values(p_company_id,p_batch_id,p_device_id,upper(coalesce(p_source,'CSV')),v_rows,'PROCESSING',auth.uid())
  returning id into v_import_id;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    v_index:=v_index+1;
    v_weight:=nullif(v_entry->>'weight_g','')::numeric;
    if v_weight is null or v_weight<=0 then raise exception 'Peso inválido en lectura %.',v_index; end if;
    v_quality:=upper(coalesce(nullif(v_entry->>'quality',''),'GOOD'));
    if v_quality not in ('GOOD','DAMAGED') then v_quality:='DAMAGED'; end if;
    v_uv:=upper(coalesce(nullif(v_entry->>'uv',''),'UNKNOWN'));
    if v_uv not in ('PASS','FAIL','UNKNOWN') then v_uv:='UNKNOWN'; end if;
    v_raw:=coalesce(v_entry->>'raw','');

    v_grade:=public.egg_grade_for_weight(p_company_id,v_weight);
    if v_grade is null then raise exception 'No existe clasificación para el peso % g.',v_weight; end if;

    if v_uv='FAIL' then v_quality:='DAMAGED'; end if;

    insert into public.egg_weight_events(
      company_id,import_id,batch_id,device_id,sequence_no,weight_g,quality_status,uv_status,grade_id,raw_line
    ) values(
      p_company_id,v_import_id,p_batch_id,p_device_id,v_index,v_weight,v_quality,v_uv,v_grade,v_raw
    );

    select quantity_eggs+damaged_eggs,avg_weight_g
      into v_current_total,v_current_avg
    from public.egg_batch_classifications
    where batch_id=p_batch_id and grade_id=v_grade;

    v_current_total:=coalesce(v_current_total,0);
    v_new_total:=v_current_total+1;

    insert into public.egg_batch_classifications(
      company_id,batch_id,grade_id,quantity_eggs,damaged_eggs,avg_weight_g,created_by
    )
    values(
      p_company_id,p_batch_id,v_grade,
      case when v_quality='GOOD' then 1 else 0 end,
      case when v_quality='DAMAGED' then 1 else 0 end,
      v_weight,auth.uid()
    )
    on conflict(batch_id,grade_id) do update
    set quantity_eggs=public.egg_batch_classifications.quantity_eggs + case when v_quality='GOOD' then 1 else 0 end,
        damaged_eggs=public.egg_batch_classifications.damaged_eggs + case when v_quality='DAMAGED' then 1 else 0 end,
        avg_weight_g=round(((coalesce(v_current_avg,v_weight)*v_current_total)+v_weight)/v_new_total,2);

    if v_quality='GOOD' then v_good:=v_good+1; else v_bad:=v_bad+1; end if;
  end loop;

  v_unit_cost:=case when v_batch.total_eggs>0 then v_batch.total_cost/v_batch.total_eggs else 0 end;

  for r in
    select grade_id,count(*)::integer as qty
    from public.egg_weight_events
    where import_id=v_import_id and quality_status='GOOD'
    group by grade_id
  loop
    insert into public.egg_inventory_movements(
      company_id,grade_id,batch_id,movement_type,quantity_eggs,unit_cost,notes,created_by
    )
    values(
      p_company_id,r.grade_id,p_batch_id,'RECEIPT',r.qty,v_unit_cost,
      'Entrada automática desde clasificadora · importación '||v_import_id::text,auth.uid()
    );
  end loop;

  select coalesce(sum(quantity_eggs+damaged_eggs),0) into v_used
  from public.egg_batch_classifications where batch_id=p_batch_id;

  if v_used=v_batch.total_eggs then
    update public.egg_batches set status='CLASSIFIED',updated_at=now() where id=p_batch_id;
  end if;

  update public.egg_machine_imports
  set rows_accepted=v_good,rows_rejected=v_bad,status='COMPLETED',completed_at=now()
  where id=v_import_id;

  return jsonb_build_object(
    'import_id',v_import_id,
    'received',v_rows,
    'accepted',v_good,
    'rejected',v_bad,
    'batch_complete',v_used=v_batch.total_eggs
  );
exception when others then
  if v_import_id is not null then
    update public.egg_machine_imports
    set status='FAILED',notes=sqlerrm,completed_at=now()
    where id=v_import_id;
  end if;
  raise;
end;
$$;

grant execute on function public.egg_create_route(uuid,date,text,text,text,text) to authenticated;
grant execute on function public.egg_add_order_to_route(uuid,uuid) to authenticated;
grant execute on function public.egg_start_route(uuid) to authenticated;
grant execute on function public.egg_deliver_route_stop(uuid,text,numeric,text,text,text) to authenticated;
grant execute on function public.egg_import_weight_events(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.egg_record_payment(uuid,numeric,text,text) to authenticated;

insert into public.saas_modules(code,name,description,is_core,active)
values
  ('EGG_LOGISTICS','Rutas y Despachos','Planificación de rutas, entregas y cobros en reparto.',false,true),
  ('EGG_MACHINE','Clasificadora de Huevos','Importación automática de pesos, calidad y lectura UV.',false,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.saas_vertical_modules(vertical_id,module_id,enabled_by_default)
select v.id,m.id,true
from public.saas_verticals v
join public.saas_modules m on m.code in ('EGG_LOGISTICS','EGG_MACHINE','DTE')
where v.code='EGG_WHOLESALE'
on conflict(vertical_id,module_id) do update set enabled_by_default=true;

insert into public.saas_plan_modules(plan_id,module_id,enabled)
select p.id,m.id,true
from public.saas_plans p
join public.saas_modules m on m.code in ('EGG_LOGISTICS','EGG_MACHINE')
where p.active=true and p.code<>'OWNER_INTERNAL'
on conflict(plan_id,module_id) do update set enabled=true;
