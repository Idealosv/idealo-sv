-- IDEALO Eggs: suite comercial completa
-- Precios, rentabilidad, carga/despacho, devoluciones, reportes, roles, adaptadores de máquina y planes SaaS.

-- 1) Roles especializados
create table if not exists public.egg_user_roles (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('MANAGER','SALES','WAREHOUSE','CLASSIFIER','DRIVER','CASHIER','VIEWER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(company_id,user_id)
);

alter table public.egg_user_roles enable row level security;

drop policy if exists egg_role_select on public.egg_user_roles;
create policy egg_role_select on public.egg_user_roles
for select to authenticated
using (public.egg_company_member(company_id));

create or replace function public.egg_effective_role(p_company_id uuid,p_user_id uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path='public'
as $$
declare v_company_role text; v_egg_role text;
begin
  select lower(role) into v_company_role
  from public.company_members
  where company_id=p_company_id and user_id=p_user_id;

  if v_company_role is null then return null; end if;
  if v_company_role='owner' then return 'OWNER'; end if;
  if v_company_role='admin' then return 'MANAGER'; end if;

  select role into v_egg_role
  from public.egg_user_roles
  where company_id=p_company_id and user_id=p_user_id;

  if v_egg_role is not null then return v_egg_role; end if;
  if v_company_role='viewer' then return 'VIEWER'; end if;
  return 'SALES';
end;
$$;

create or replace function public.egg_can(p_company_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path='public'
as $$
declare v_role text:=public.egg_effective_role(p_company_id,p_user_id); p text:=lower(coalesce(p_permission,''));
begin
  if v_role is null then return false; end if;
  if v_role in ('OWNER','MANAGER') then return true; end if;
  if p in ('view','reports.read','pricing.read') then return true; end if;

  return case v_role
    when 'SALES' then p in ('sales.write','customer.write')
    when 'WAREHOUSE' then p in ('inventory.write','supplier.write','dispatch.write','returns.write')
    when 'CLASSIFIER' then p in ('classify.write','machine.write','inventory.write')
    when 'DRIVER' then p in ('route.delivery','collections.write','mobile.use')
    when 'CASHIER' then p in ('collections.write','dte.write')
    when 'VIEWER' then false
    else false
  end;
end;
$$;

revoke all on function public.egg_effective_role(uuid,uuid) from public;
revoke all on function public.egg_can(uuid,text,uuid) from public;
grant execute on function public.egg_effective_role(uuid,uuid) to authenticated,service_role;
grant execute on function public.egg_can(uuid,text,uuid) to authenticated,service_role;

drop policy if exists egg_role_insert on public.egg_user_roles;
drop policy if exists egg_role_update on public.egg_user_roles;
drop policy if exists egg_role_delete on public.egg_user_roles;
create policy egg_role_insert on public.egg_user_roles for insert to authenticated
with check (public.egg_can(company_id,'users.write'));
create policy egg_role_update on public.egg_user_roles for update to authenticated
using (public.egg_can(company_id,'users.write')) with check (public.egg_can(company_id,'users.write'));
create policy egg_role_delete on public.egg_user_roles for delete to authenticated
using (public.egg_can(company_id,'users.write'));

grant select,insert,update,delete on public.egg_user_roles to authenticated;
grant all privileges on public.egg_user_roles to service_role;

-- 2) Precios mayoristas y rentabilidad
create table if not exists public.egg_price_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.egg_customers(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id) on delete cascade,
  presentation text not null default 'Bandeja',
  eggs_per_unit integer not null default 30 check(eggs_per_unit>0),
  min_units numeric(12,2) not null default 1 check(min_units>0),
  max_units numeric(12,2),
  unit_price numeric(14,4) not null check(unit_price>=0),
  valid_from date,
  valid_until date,
  active boolean not null default true,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(max_units is null or max_units>=min_units)
);

create index if not exists egg_price_rules_lookup_idx
on public.egg_price_rules(company_id,grade_id,presentation,customer_id,active,min_units);

alter table public.egg_price_rules enable row level security;
drop policy if exists egg_price_select on public.egg_price_rules;
drop policy if exists egg_price_insert on public.egg_price_rules;
drop policy if exists egg_price_update on public.egg_price_rules;
drop policy if exists egg_price_delete on public.egg_price_rules;
create policy egg_price_select on public.egg_price_rules for select to authenticated
using (public.egg_company_member(company_id));
create policy egg_price_insert on public.egg_price_rules for insert to authenticated
with check (public.egg_can(company_id,'pricing.write'));
create policy egg_price_update on public.egg_price_rules for update to authenticated
using (public.egg_can(company_id,'pricing.write')) with check (public.egg_can(company_id,'pricing.write'));
create policy egg_price_delete on public.egg_price_rules for delete to authenticated
using (public.egg_can(company_id,'pricing.write'));

grant select,insert,update,delete on public.egg_price_rules to authenticated;
grant all privileges on public.egg_price_rules to service_role;

alter table public.egg_order_items
  add column if not exists unit_cost_per_egg numeric(14,6) not null default 0,
  add column if not exists cost_total numeric(14,2) not null default 0,
  add column if not exists profit_amount numeric(14,2) not null default 0,
  add column if not exists margin_percent numeric(8,2) not null default 0;

create or replace function public.egg_resolve_price(
  p_company_id uuid,
  p_customer_id uuid,
  p_grade_id uuid,
  p_presentation text,
  p_quantity_units numeric,
  p_eggs_per_unit integer
)
returns numeric
language sql
stable
security definer
set search_path='public'
as $$
  select r.unit_price
  from public.egg_price_rules r
  where r.company_id=p_company_id
    and r.grade_id=p_grade_id
    and r.active=true
    and lower(r.presentation)=lower(coalesce(p_presentation,'Bandeja'))
    and r.eggs_per_unit=coalesce(p_eggs_per_unit,r.eggs_per_unit)
    and coalesce(p_quantity_units,0)>=r.min_units
    and (r.max_units is null or coalesce(p_quantity_units,0)<=r.max_units)
    and (r.customer_id is null or r.customer_id=p_customer_id)
    and (r.valid_from is null or r.valid_from<=current_date)
    and (r.valid_until is null or r.valid_until>=current_date)
  order by (r.customer_id is not null) desc,r.min_units desc,r.created_at desc
  limit 1
$$;

grant execute on function public.egg_resolve_price(uuid,uuid,uuid,text,numeric,integer) to authenticated,service_role;

-- 3) Devoluciones y pérdidas
create table if not exists public.egg_loss_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  batch_id uuid references public.egg_batches(id) on delete set null,
  order_id uuid references public.egg_orders(id) on delete set null,
  route_id uuid references public.egg_routes(id) on delete set null,
  loss_type text not null check(loss_type in ('BREAKAGE','DIRTY','EXPIRED','UV_REJECT','TRANSPORT','ADJUSTMENT','OTHER')),
  quantity_eggs integer not null check(quantity_eggs>0),
  inventory_impact boolean not null default true,
  estimated_cost numeric(14,2) not null default 0,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.egg_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.egg_orders(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  quantity_eggs integer not null check(quantity_eggs>0),
  disposition text not null check(disposition in ('RESTOCK','DAMAGED')),
  reason text not null default '',
  refund_amount numeric(14,2) not null default 0 check(refund_amount>=0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists egg_loss_company_date_idx on public.egg_loss_events(company_id,created_at desc);
create index if not exists egg_returns_order_idx on public.egg_returns(order_id,created_at desc);

alter table public.egg_loss_events enable row level security;
alter table public.egg_returns enable row level security;

do $$
declare t text;
begin
  foreach t in array array['egg_loss_events','egg_returns']
  loop
    execute format('drop policy if exists egg_member_select on public.%I',t);
    execute format('drop policy if exists egg_member_insert on public.%I',t);
    execute format('drop policy if exists egg_member_update on public.%I',t);
    execute format('drop policy if exists egg_member_delete on public.%I',t);
    execute format('create policy egg_member_select on public.%I for select to authenticated using (public.egg_company_member(company_id))',t);
    execute format('create policy egg_member_insert on public.%I for insert to authenticated with check (public.egg_can(company_id,''returns.write''))',t);
    execute format('create policy egg_member_update on public.%I for update to authenticated using (public.egg_can(company_id,''returns.write'')) with check (public.egg_can(company_id,''returns.write''))',t);
    execute format('create policy egg_member_delete on public.%I for delete to authenticated using (public.egg_can(company_id,''returns.write''))',t);
  end loop;
end $$;

grant select,insert,update,delete on public.egg_loss_events,public.egg_returns to authenticated;
grant all privileges on public.egg_loss_events,public.egg_returns to service_role;

-- 4) Carga / despacho completo
alter table public.egg_routes
  add column if not exists load_prepared_at timestamptz,
  add column if not exists load_closed_at timestamptz;

create table if not exists public.egg_route_load_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.egg_routes(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  expected_eggs integer not null default 0 check(expected_eggs>=0),
  loaded_eggs integer not null default 0 check(loaded_eggs>=0),
  returned_good_eggs integer not null default 0 check(returned_good_eggs>=0),
  damaged_eggs integer not null default 0 check(damaged_eggs>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(route_id,grade_id)
);

alter table public.egg_route_load_items enable row level security;
drop policy if exists egg_member_select on public.egg_route_load_items;
drop policy if exists egg_member_insert on public.egg_route_load_items;
drop policy if exists egg_member_update on public.egg_route_load_items;
drop policy if exists egg_member_delete on public.egg_route_load_items;
create policy egg_member_select on public.egg_route_load_items for select to authenticated
using (public.egg_company_member(company_id));
create policy egg_member_insert on public.egg_route_load_items for insert to authenticated
with check (public.egg_can(company_id,'dispatch.write'));
create policy egg_member_update on public.egg_route_load_items for update to authenticated
using (public.egg_can(company_id,'dispatch.write') or public.egg_can(company_id,'route.delivery'))
with check (public.egg_can(company_id,'dispatch.write') or public.egg_can(company_id,'route.delivery'));
create policy egg_member_delete on public.egg_route_load_items for delete to authenticated
using (public.egg_can(company_id,'dispatch.write'));

grant select,insert,update,delete on public.egg_route_load_items to authenticated;
grant all privileges on public.egg_route_load_items to service_role;

-- 5) Adaptadores configurables para máquinas
alter table public.egg_machine_devices
  add column if not exists delimiter text not null default ',',
  add column if not exists decimal_separator text not null default '.',
  add column if not exists weight_column integer not null default 0 check(weight_column>=0),
  add column if not exists quality_column integer not null default 1 check(quality_column>=0),
  add column if not exists uv_column integer not null default 2 check(uv_column>=0),
  add column if not exists weight_multiplier numeric(12,6) not null default 1 check(weight_multiplier>0),
  add column if not exists line_ending text not null default 'AUTO',
  add column if not exists adapter_name text not null default 'GENERIC';

-- 6) Operaciones seguras
create or replace function public.egg_record_loss(
  p_company_id uuid,p_grade_id uuid,p_quantity_eggs integer,p_loss_type text,
  p_batch_id uuid default null,p_order_id uuid default null,p_route_id uuid default null,p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_stock bigint; v_cost numeric; v_id uuid; v_type text:=upper(coalesce(p_loss_type,'OTHER'));
begin
  if not public.egg_can(p_company_id,'returns.write') then raise exception 'Sin permiso para registrar pérdidas.'; end if;
  if coalesce(p_quantity_eggs,0)<=0 then raise exception 'Cantidad inválida.'; end if;
  if v_type not in ('BREAKAGE','DIRTY','EXPIRED','UV_REJECT','TRANSPORT','ADJUSTMENT','OTHER') then v_type:='OTHER'; end if;
  select coalesce(stock_eggs,0),coalesce(avg_cost_per_egg,0) into v_stock,v_cost
  from public.egg_inventory_stock where company_id=p_company_id and grade_id=p_grade_id;
  if coalesce(v_stock,0)<p_quantity_eggs then raise exception 'Inventario insuficiente para registrar la pérdida.'; end if;

  insert into public.egg_loss_events(company_id,grade_id,batch_id,order_id,route_id,loss_type,quantity_eggs,inventory_impact,estimated_cost,notes,created_by)
  values(p_company_id,p_grade_id,p_batch_id,p_order_id,p_route_id,v_type,p_quantity_eggs,true,round(p_quantity_eggs*coalesce(v_cost,0),2),coalesce(p_notes,''),auth.uid())
  returning id into v_id;

  insert into public.egg_inventory_movements(company_id,grade_id,batch_id,order_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
  values(p_company_id,p_grade_id,p_batch_id,p_order_id,'ADJUSTMENT',-p_quantity_eggs,coalesce(v_cost,0),'Pérdida: '||v_type||' · '||coalesce(p_notes,''),auth.uid());

  return v_id;
end;
$$;

create or replace function public.egg_record_return(
  p_order_id uuid,p_grade_id uuid,p_quantity_eggs integer,p_disposition text,
  p_reason text default '',p_refund_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_order public.egg_orders%rowtype; v_sold integer; v_returned integer; v_cost numeric; v_id uuid; v_disp text:=upper(coalesce(p_disposition,'RESTOCK'));
begin
  select * into v_order from public.egg_orders where id=p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.egg_can(v_order.company_id,'returns.write') then raise exception 'Sin permiso para registrar devoluciones.'; end if;
  if v_disp not in ('RESTOCK','DAMAGED') then raise exception 'Destino de devolución inválido.'; end if;
  if coalesce(p_quantity_eggs,0)<=0 then raise exception 'Cantidad inválida.'; end if;

  select coalesce(sum(total_eggs),0) into v_sold
  from public.egg_order_items where order_id=p_order_id and grade_id=p_grade_id;
  select coalesce(sum(quantity_eggs),0) into v_returned
  from public.egg_returns where order_id=p_order_id and grade_id=p_grade_id;
  if v_returned+p_quantity_eggs>v_sold then raise exception 'La devolución supera lo vendido de esta clasificación.'; end if;

  select coalesce(avg_cost_per_egg,0) into v_cost
  from public.egg_inventory_stock where company_id=v_order.company_id and grade_id=p_grade_id;

  insert into public.egg_returns(company_id,order_id,grade_id,quantity_eggs,disposition,reason,refund_amount,created_by)
  values(v_order.company_id,p_order_id,p_grade_id,p_quantity_eggs,v_disp,coalesce(p_reason,''),coalesce(p_refund_amount,0),auth.uid())
  returning id into v_id;

  if v_disp='RESTOCK' then
    insert into public.egg_inventory_movements(company_id,grade_id,order_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values(v_order.company_id,p_grade_id,p_order_id,'RETURN',p_quantity_eggs,coalesce(v_cost,0),'Devolución de cliente · '||coalesce(p_reason,''),auth.uid());
  else
    insert into public.egg_loss_events(company_id,grade_id,order_id,loss_type,quantity_eggs,inventory_impact,estimated_cost,notes,created_by)
    values(v_order.company_id,p_grade_id,p_order_id,'OTHER',p_quantity_eggs,false,round(p_quantity_eggs*coalesce(v_cost,0),2),'Devolución dañada · '||coalesce(p_reason,''),auth.uid());
  end if;

  return v_id;
end;
$$;

create or replace function public.egg_prepare_route_load(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.egg_routes where id=p_route_id;
  if v_company is null then raise exception 'Ruta no encontrada.'; end if;
  if not public.egg_can(v_company,'dispatch.write') then raise exception 'Sin permiso para preparar despachos.'; end if;

  delete from public.egg_route_load_items where route_id=p_route_id;

  insert into public.egg_route_load_items(company_id,route_id,grade_id,expected_eggs,loaded_eggs)
  select v_company,p_route_id,oi.grade_id,sum(oi.total_eggs)::integer,sum(oi.total_eggs)::integer
  from public.egg_route_stops rs
  join public.egg_order_items oi on oi.order_id=rs.order_id
  where rs.route_id=p_route_id and rs.status='PENDING'
  group by oi.grade_id;

  update public.egg_routes set load_prepared_at=now(),updated_at=now() where id=p_route_id;
end;
$$;

create or replace function public.egg_record_route_return(
  p_route_id uuid,p_grade_id uuid,p_returned_good integer,p_damaged integer default 0,p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_company uuid; v_load public.egg_route_load_items%rowtype; v_cost numeric;
begin
  select company_id into v_company from public.egg_routes where id=p_route_id;
  if v_company is null then raise exception 'Ruta no encontrada.'; end if;
  if not (public.egg_can(v_company,'dispatch.write') or public.egg_can(v_company,'route.delivery')) then raise exception 'Sin permiso para cerrar carga.'; end if;
  select * into v_load from public.egg_route_load_items where route_id=p_route_id and grade_id=p_grade_id;
  if not found then raise exception 'La clasificación no forma parte de la carga.'; end if;
  if coalesce(p_returned_good,0)<0 or coalesce(p_damaged,0)<0 then raise exception 'Cantidades inválidas.'; end if;
  if p_returned_good+p_damaged>v_load.loaded_eggs then raise exception 'El retorno supera la carga registrada.'; end if;

  update public.egg_route_load_items
  set returned_good_eggs=p_returned_good,damaged_eggs=p_damaged,updated_at=now()
  where id=v_load.id;

  select coalesce(avg_cost_per_egg,0) into v_cost from public.egg_inventory_stock where company_id=v_company and grade_id=p_grade_id;

  if p_returned_good>0 then
    insert into public.egg_inventory_movements(company_id,grade_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values(v_company,p_grade_id,'RETURN',p_returned_good,coalesce(v_cost,0),'Retorno de ruta '||p_route_id::text||' · '||coalesce(p_notes,''),auth.uid());
  end if;
  if p_damaged>0 then
    insert into public.egg_loss_events(company_id,grade_id,route_id,loss_type,quantity_eggs,inventory_impact,estimated_cost,notes,created_by)
    values(v_company,p_grade_id,p_route_id,'TRANSPORT',p_damaged,false,round(p_damaged*coalesce(v_cost,0),2),coalesce(p_notes,''),auth.uid());
  end if;

  update public.egg_routes set load_closed_at=now(),updated_at=now() where id=p_route_id;
end;
$$;

create or replace function public.egg_mark_route_stop_failed(p_stop_id uuid,p_notes text default '')
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_stop public.egg_route_stops%rowtype; v_pending integer;
begin
  select * into v_stop from public.egg_route_stops where id=p_stop_id;
  if not found then raise exception 'Parada no encontrada.'; end if;
  if not (public.egg_can(v_stop.company_id,'route.delivery') or public.egg_can(v_stop.company_id,'dispatch.write')) then raise exception 'Sin permiso para actualizar la entrega.'; end if;
  update public.egg_route_stops set status='FAILED',notes=coalesce(p_notes,''),updated_at=now() where id=p_stop_id and status='PENDING';
  select count(*) into v_pending from public.egg_route_stops where route_id=v_stop.route_id and status='PENDING';
  if v_pending=0 then update public.egg_routes set status='COMPLETED',updated_at=now() where id=v_stop.route_id; end if;
end;
$$;

grant execute on function public.egg_record_loss(uuid,uuid,integer,text,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.egg_record_return(uuid,uuid,integer,text,text,numeric) to authenticated;
grant execute on function public.egg_prepare_route_load(uuid) to authenticated;
grant execute on function public.egg_record_route_return(uuid,uuid,integer,integer,text) to authenticated;
grant execute on function public.egg_mark_route_stop_failed(uuid,text) to authenticated;

-- Reemplaza venta para usar precios automáticos y capturar rentabilidad.
create or replace function public.egg_create_order(
  p_company_id uuid,
  p_customer_id uuid,
  p_grade_id uuid,
  p_presentation text,
  p_quantity_units numeric,
  p_eggs_per_unit integer,
  p_unit_price numeric,
  p_payment_type text default 'CREDIT',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_order_id uuid; v_order_number text; v_total_eggs integer; v_stock bigint;
  v_total numeric; v_credit_days integer; v_credit_limit numeric; v_open_balance numeric;
  v_due date; v_price numeric; v_cost_per_egg numeric:=0; v_cost_total numeric:=0; v_profit numeric:=0; v_margin numeric:=0;
begin
  if not public.egg_can(p_company_id,'sales.write') then raise exception 'Sin permiso para registrar ventas.'; end if;
  if not exists(select 1 from public.egg_customers where id=p_customer_id and company_id=p_company_id and active=true) then raise exception 'Cliente inválido.'; end if;
  if not exists(select 1 from public.egg_grades where id=p_grade_id and company_id=p_company_id and active=true) then raise exception 'Clasificación inválida.'; end if;
  if coalesce(p_quantity_units,0)<=0 or coalesce(p_eggs_per_unit,0)<=0 then raise exception 'Cantidad inválida.'; end if;
  if coalesce(p_unit_price,0)<0 then raise exception 'Precio inválido.'; end if;

  v_total_eggs:=round(p_quantity_units*p_eggs_per_unit);
  select coalesce(stock_eggs,0),coalesce(avg_cost_per_egg,0) into v_stock,v_cost_per_egg
  from public.egg_inventory_stock
  where company_id=p_company_id and grade_id=p_grade_id;
  if coalesce(v_stock,0)<v_total_eggs then raise exception 'Inventario insuficiente para este pedido. Disponible: % huevos.',coalesce(v_stock,0); end if;

  v_price:=coalesce(p_unit_price,0);
  if v_price=0 then
    v_price:=coalesce(public.egg_resolve_price(p_company_id,p_customer_id,p_grade_id,p_presentation,p_quantity_units,p_eggs_per_unit),0);
  end if;
  if v_price<=0 then raise exception 'No existe un precio mayorista para esta venta. Configurá Precios o ingresá un precio manual.'; end if;

  select credit_days,credit_limit into v_credit_days,v_credit_limit from public.egg_customers where id=p_customer_id;
  v_total:=round((p_quantity_units*v_price)::numeric,2);
  v_cost_total:=round((v_total_eggs*coalesce(v_cost_per_egg,0))::numeric,2);
  v_profit:=round(v_total-v_cost_total,2);
  v_margin:=case when v_total>0 then round(v_profit/v_total*100,2) else 0 end;

  if upper(coalesce(p_payment_type,'CREDIT'))='CREDIT' and coalesce(v_credit_limit,0)>0 then
    select coalesce(sum(greatest(total-paid_amount,0)),0) into v_open_balance
    from public.egg_orders where company_id=p_company_id and customer_id=p_customer_id and status not in ('PAID','CANCELLED');
    if v_open_balance+v_total>v_credit_limit then
      raise exception 'El pedido supera el límite de crédito del cliente. Disponible: %.',greatest(v_credit_limit-v_open_balance,0);
    end if;
  end if;

  v_order_id:=gen_random_uuid();
  v_order_number:='EGG-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,6));
  v_due:=case when upper(coalesce(p_payment_type,'CREDIT'))='CREDIT' and coalesce(v_credit_days,0)>0 then current_date+v_credit_days else current_date end;

  insert into public.egg_orders(id,company_id,customer_id,order_number,order_date,due_date,status,payment_type,subtotal,total,paid_amount,notes,created_by)
  values(v_order_id,p_company_id,p_customer_id,v_order_number,current_date,v_due,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'PAID' else 'CONFIRMED' end,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'CASH' else 'CREDIT' end,
    v_total,v_total,case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then v_total else 0 end,coalesce(p_notes,''),auth.uid());

  insert into public.egg_order_items(company_id,order_id,grade_id,presentation,quantity_units,eggs_per_unit,total_eggs,unit_price,line_total,unit_cost_per_egg,cost_total,profit_amount,margin_percent)
  values(p_company_id,v_order_id,p_grade_id,coalesce(nullif(trim(p_presentation),''),'Bandeja'),p_quantity_units,p_eggs_per_unit,v_total_eggs,v_price,v_total,coalesce(v_cost_per_egg,0),v_cost_total,v_profit,v_margin);

  insert into public.egg_inventory_movements(company_id,grade_id,order_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
  values(p_company_id,p_grade_id,v_order_id,'SALE',-v_total_eggs,coalesce(v_cost_per_egg,0),'Salida por pedido '||v_order_number,auth.uid());

  if upper(coalesce(p_payment_type,'CREDIT'))='CASH' and v_total>0 then
    insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
    values(p_company_id,v_order_id,v_total,'CASH','Pago al contado',auth.uid());
  end if;
  return v_order_id;
end;
$$;

-- Refuerza permisos de las operaciones existentes.
create or replace function public.egg_receive_batch(
  p_company_id uuid,p_supplier_id uuid,p_total_eggs integer,p_total_cost numeric,
  p_received_at date default current_date,p_source_reference text default '',p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_id uuid; v_code text;
begin
  if not public.egg_can(p_company_id,'inventory.write') then raise exception 'Sin permiso para recibir inventario.'; end if;
  if coalesce(p_total_eggs,0)<=0 then raise exception 'La cantidad de huevos debe ser mayor que cero.'; end if;
  if coalesce(p_total_cost,0)<0 then raise exception 'El costo no puede ser negativo.'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.egg_suppliers where id=p_supplier_id and company_id=p_company_id) then raise exception 'Proveedor inválido.'; end if;
  v_id:=gen_random_uuid();
  v_code:='LOT-'||to_char(coalesce(p_received_at,current_date),'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));
  insert into public.egg_batches(id,company_id,supplier_id,batch_code,received_at,total_eggs,total_cost,source_reference,notes,created_by)
  values(v_id,p_company_id,p_supplier_id,v_code,coalesce(p_received_at,current_date),p_total_eggs,coalesce(p_total_cost,0),coalesce(p_source_reference,''),coalesce(p_notes,''),auth.uid());
  return v_id;
end;
$$;

create or replace function public.egg_classify_batch(
  p_batch_id uuid,p_grade_id uuid,p_quantity_eggs integer,p_damaged_eggs integer default 0,p_avg_weight_g numeric default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_batch public.egg_batches%rowtype; v_id uuid; v_used integer; v_unit_cost numeric;
begin
  select * into v_batch from public.egg_batches where id=p_batch_id;
  if not found then raise exception 'Lote no encontrado.'; end if;
  if not public.egg_can(v_batch.company_id,'classify.write') then raise exception 'Sin permiso para clasificar lotes.'; end if;
  if not exists(select 1 from public.egg_grades where id=p_grade_id and company_id=v_batch.company_id and active=true) then raise exception 'Clasificación inválida.'; end if;
  if coalesce(p_quantity_eggs,0)<0 or coalesce(p_damaged_eggs,0)<0 then raise exception 'Cantidades inválidas.'; end if;
  if coalesce(p_quantity_eggs,0)+coalesce(p_damaged_eggs,0)<=0 then raise exception 'Ingresá una cantidad a clasificar.'; end if;
  if exists(select 1 from public.egg_batch_classifications where batch_id=p_batch_id and grade_id=p_grade_id) then raise exception 'Ese tamaño ya fue registrado en este lote.'; end if;
  select coalesce(sum(quantity_eggs+damaged_eggs),0) into v_used from public.egg_batch_classifications where batch_id=p_batch_id;
  if v_used+p_quantity_eggs+p_damaged_eggs>v_batch.total_eggs then raise exception 'La clasificación supera los huevos recibidos en el lote.'; end if;
  insert into public.egg_batch_classifications(company_id,batch_id,grade_id,quantity_eggs,damaged_eggs,avg_weight_g,created_by)
  values(v_batch.company_id,p_batch_id,p_grade_id,p_quantity_eggs,p_damaged_eggs,p_avg_weight_g,auth.uid()) returning id into v_id;
  v_unit_cost:=case when v_batch.total_eggs>0 then v_batch.total_cost/v_batch.total_eggs else 0 end;
  if p_quantity_eggs>0 then
    insert into public.egg_inventory_movements(company_id,grade_id,batch_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values(v_batch.company_id,p_grade_id,p_batch_id,'RECEIPT',p_quantity_eggs,v_unit_cost,'Entrada por clasificación de lote',auth.uid());
  end if;
  if v_used+p_quantity_eggs+p_damaged_eggs=v_batch.total_eggs then update public.egg_batches set status='CLASSIFIED',updated_at=now() where id=p_batch_id; end if;
  return v_id;
end;
$$;

create or replace function public.egg_record_payment(
  p_order_id uuid,p_amount numeric,p_method text default 'CASH',p_reference text default ''
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
  if not public.egg_can(v_order.company_id,'collections.write') then raise exception 'Sin permiso para registrar cobros.'; end if;
  if v_order.status='CANCELLED' then raise exception 'No se puede abonar a un pedido cancelado.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El abono debe ser mayor que cero.'; end if;
  v_balance:=greatest(v_order.total-v_order.paid_amount,0);
  if p_amount>v_balance then raise exception 'El abono supera el saldo pendiente de %.',v_balance; end if;
  insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
  values(v_order.company_id,p_order_id,p_amount,
    case when upper(coalesce(p_method,'CASH')) in ('CASH','TRANSFER','CHECK','OTHER') then upper(p_method) else 'OTHER' end,
    coalesce(p_reference,''),auth.uid()) returning id into v_id;
  v_paid:=v_order.paid_amount+p_amount;
  update public.egg_orders set paid_amount=v_paid,status=case when v_paid>=total then 'PAID' else status end,updated_at=now() where id=p_order_id;
  return v_id;
end;
$$;

-- 7) Reportes gerenciales
create or replace view public.egg_sales_profitability_report
with (security_invoker=true)
as
select
  o.company_id,o.id as order_id,o.order_number,o.order_date,o.status,o.payment_type,
  c.id as customer_id,c.name as customer_name,
  g.id as grade_id,g.name as grade_name,
  oi.presentation,oi.quantity_units,oi.total_eggs,oi.unit_price,oi.line_total,
  oi.cost_total,oi.profit_amount,oi.margin_percent,
  o.paid_amount,greatest(o.total-o.paid_amount,0) as order_balance
from public.egg_orders o
join public.egg_customers c on c.id=o.customer_id
join public.egg_order_items oi on oi.order_id=o.id
join public.egg_grades g on g.id=oi.grade_id
where o.status<>'CANCELLED';

create or replace view public.egg_customer_balance_report
with (security_invoker=true)
as
select c.company_id,c.id as customer_id,c.name,
  count(o.id) filter(where o.status<>'CANCELLED') as orders_count,
  coalesce(sum(o.total) filter(where o.status<>'CANCELLED'),0) as sales_total,
  coalesce(sum(o.paid_amount) filter(where o.status<>'CANCELLED'),0) as paid_total,
  coalesce(sum(greatest(o.total-o.paid_amount,0)) filter(where o.status<>'CANCELLED'),0) as balance,
  min(o.due_date) filter(where o.status='CONFIRMED' and o.due_date<current_date) as oldest_overdue_date
from public.egg_customers c
left join public.egg_orders o on o.customer_id=c.id
group by c.company_id,c.id,c.name;

create or replace view public.egg_supplier_purchase_report
with (security_invoker=true)
as
select b.company_id,s.id as supplier_id,coalesce(s.name,'Sin proveedor') as supplier_name,
  count(b.id) as batches_count,sum(b.total_eggs) as eggs_received,sum(b.total_cost) as purchase_cost,
  case when sum(b.total_eggs)>0 then round(sum(b.total_cost)/sum(b.total_eggs),6) else 0 end as avg_cost_per_egg
from public.egg_batches b
left join public.egg_suppliers s on s.id=b.supplier_id
group by b.company_id,s.id,s.name;

create or replace view public.egg_loss_summary_report
with (security_invoker=true)
as
select l.company_id,l.loss_type,g.name as grade_name,
  count(l.id) as events_count,sum(l.quantity_eggs) as eggs_lost,sum(l.estimated_cost) as estimated_cost
from public.egg_loss_events l
join public.egg_grades g on g.id=l.grade_id
group by l.company_id,l.loss_type,g.name;

create or replace view public.egg_route_performance_report
with (security_invoker=true)
as
select r.company_id,r.id as route_id,r.route_code,r.route_date,r.name,r.driver_name,r.vehicle,r.status,
  count(s.id) as stops,
  count(s.id) filter(where s.status='DELIVERED') as delivered,
  count(s.id) filter(where s.status='FAILED') as failed,
  coalesce(sum(s.collected_amount),0) as collected_amount
from public.egg_routes r
left join public.egg_route_stops s on s.route_id=r.id
group by r.company_id,r.id,r.route_code,r.route_date,r.name,r.driver_name,r.vehicle,r.status;

grant select on public.egg_sales_profitability_report,public.egg_customer_balance_report,
 public.egg_supplier_purchase_report,public.egg_loss_summary_report,public.egg_route_performance_report
to authenticated,service_role;

-- 8) Endurece RLS de escritura según rol
do $$
declare rec record; t text; perm text;
begin
  for rec in select * from (values
    ('egg_suppliers','supplier.write'),
    ('egg_grades','classify.write'),
    ('egg_batches','inventory.write'),
    ('egg_batch_classifications','classify.write'),
    ('egg_customers','customer.write'),
    ('egg_orders','sales.write'),
    ('egg_order_items','sales.write'),
    ('egg_payments','collections.write'),
    ('egg_inventory_movements','inventory.write'),
    ('egg_routes','dispatch.write'),
    ('egg_route_stops','dispatch.write'),
    ('egg_machine_devices','machine.write'),
    ('egg_machine_imports','machine.write'),
    ('egg_weight_events','machine.write')
  ) as x(table_name,permission)
  loop
    t:=rec.table_name; perm:=rec.permission;
    execute format('drop policy if exists egg_member_insert on public.%I',t);
    execute format('drop policy if exists egg_member_update on public.%I',t);
    execute format('drop policy if exists egg_member_delete on public.%I',t);
    execute format('create policy egg_member_insert on public.%I for insert to authenticated with check (public.egg_can(company_id,%L))',t,perm);
    execute format('create policy egg_member_update on public.%I for update to authenticated using (public.egg_can(company_id,%L)) with check (public.egg_can(company_id,%L))',t,perm,perm);
    execute format('create policy egg_member_delete on public.%I for delete to authenticated using (public.egg_can(company_id,%L))',t,perm);
  end loop;
end $$;

-- 9) Módulos y planes comerciales de IDEALO Eggs
insert into public.saas_modules(code,name,description,is_core,active)
values
 ('EGG_PRICING','Precios y Rentabilidad','Precios por volumen, cliente y margen por venta.',false,true),
 ('EGG_RETURNS','Devoluciones y Pérdidas','Devoluciones, roturas, mermas y pérdidas operativas.',false,true),
 ('EGG_REPORTS','Reportes Gerenciales','Ventas, rentabilidad, cartera, compras y desempeño de rutas.',false,true),
 ('EGG_MOBILE','Reparto Móvil','Interfaz móvil de motorista para rutas, entregas y cobros.',false,true),
 ('EGG_USERS','Usuarios y Roles','Roles especializados para venta, bodega, clasificación, reparto y caja.',false,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.saas_vertical_modules(vertical_id,module_id,enabled_by_default)
select v.id,m.id,true
from public.saas_verticals v
join public.saas_modules m on m.code in ('EGG_PRICING','EGG_RETURNS','EGG_REPORTS','EGG_MOBILE','EGG_USERS')
where v.code='EGG_WHOLESALE'
on conflict(vertical_id,module_id) do update set enabled_by_default=true;

-- Básico: operación + precios + devoluciones + reportes + usuarios.
insert into public.saas_plan_modules(plan_id,module_id,enabled)
select p.id,m.id,
  case
    when p.code='BASIC' then m.code in ('EGG_OPERATIONS','EGG_PRICING','EGG_RETURNS','EGG_REPORTS','EGG_USERS')
    when p.code='PRO' then m.code in ('EGG_OPERATIONS','EGG_PRICING','EGG_RETURNS','EGG_REPORTS','EGG_USERS','EGG_LOGISTICS')
    when p.code='BUSINESS' then true
    else false
  end
from public.saas_plans p
join public.saas_modules m on m.code in (
 'EGG_OPERATIONS','EGG_PRICING','EGG_RETURNS','EGG_REPORTS','EGG_USERS','EGG_LOGISTICS','EGG_MACHINE','EGG_MOBILE'
)
where p.code in ('BASIC','PRO','BUSINESS')
on conflict(plan_id,module_id) do update set enabled=excluded.enabled;

-- Funciones necesarias
grant execute on function public.egg_create_order(uuid,uuid,uuid,text,numeric,integer,numeric,text,text) to authenticated;
grant execute on function public.egg_receive_batch(uuid,uuid,integer,numeric,date,text,text) to authenticated;
grant execute on function public.egg_classify_batch(uuid,uuid,integer,integer,numeric) to authenticated;
grant execute on function public.egg_record_payment(uuid,numeric,text,text) to authenticated;
