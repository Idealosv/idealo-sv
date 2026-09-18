-- IDEALO Eggs: núcleo operativo mayorista
-- Multiempresa, inventario por clasificación, lotes, clientes, pedidos y cobros.

create table if not exists public.egg_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,name)
);

create table if not exists public.egg_grades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  min_weight_g numeric(8,2),
  max_weight_g numeric(8,2),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);

create table if not exists public.egg_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid references public.egg_suppliers(id) on delete set null,
  batch_code text not null,
  received_at date not null default current_date,
  total_eggs integer not null check(total_eggs>0),
  total_cost numeric(14,2) not null default 0 check(total_cost>=0),
  source_reference text not null default '',
  status text not null default 'OPEN' check(status in ('OPEN','CLASSIFIED','CLOSED')),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,batch_code)
);

create table if not exists public.egg_batch_classifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid not null references public.egg_batches(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  quantity_eggs integer not null check(quantity_eggs>=0),
  damaged_eggs integer not null default 0 check(damaged_eggs>=0),
  avg_weight_g numeric(8,2),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique(batch_id,grade_id)
);

create table if not exists public.egg_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  credit_limit numeric(14,2) not null default 0 check(credit_limit>=0),
  credit_days integer not null default 0 check(credit_days>=0),
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.egg_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.egg_customers(id),
  order_number text not null,
  order_date date not null default current_date,
  due_date date,
  status text not null default 'CONFIRMED' check(status in ('DRAFT','CONFIRMED','PAID','CANCELLED')),
  payment_type text not null default 'CREDIT' check(payment_type in ('CASH','CREDIT')),
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,order_number)
);

create table if not exists public.egg_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.egg_orders(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  presentation text not null default 'TRAY',
  quantity_units numeric(12,2) not null check(quantity_units>0),
  eggs_per_unit integer not null default 30 check(eggs_per_unit>0),
  total_eggs integer not null check(total_eggs>0),
  unit_price numeric(14,2) not null check(unit_price>=0),
  line_total numeric(14,2) not null check(line_total>=0),
  created_at timestamptz not null default now()
);

create table if not exists public.egg_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.egg_orders(id) on delete cascade,
  amount numeric(14,2) not null check(amount>0),
  method text not null default 'CASH' check(method in ('CASH','TRANSFER','CHECK','OTHER')),
  reference text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.egg_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  grade_id uuid not null references public.egg_grades(id),
  batch_id uuid references public.egg_batches(id) on delete set null,
  order_id uuid references public.egg_orders(id) on delete set null,
  movement_type text not null check(movement_type in ('RECEIPT','SALE','ADJUSTMENT','RETURN')),
  quantity_eggs integer not null,
  unit_cost numeric(14,6) not null default 0,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists egg_suppliers_company_idx on public.egg_suppliers(company_id,active,name);
create index if not exists egg_batches_company_received_idx on public.egg_batches(company_id,received_at desc);
create index if not exists egg_classifications_company_idx on public.egg_batch_classifications(company_id,batch_id);
create index if not exists egg_customers_company_idx on public.egg_customers(company_id,active,name);
create index if not exists egg_orders_company_date_idx on public.egg_orders(company_id,order_date desc);
create index if not exists egg_payments_company_date_idx on public.egg_payments(company_id,paid_at desc);
create index if not exists egg_inventory_company_grade_idx on public.egg_inventory_movements(company_id,grade_id,created_at desc);

create or replace function public.egg_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
  )
$$;

revoke all on function public.egg_company_member(uuid) from public;
grant execute on function public.egg_company_member(uuid) to authenticated, service_role;

alter table public.egg_suppliers enable row level security;
alter table public.egg_grades enable row level security;
alter table public.egg_batches enable row level security;
alter table public.egg_batch_classifications enable row level security;
alter table public.egg_customers enable row level security;
alter table public.egg_orders enable row level security;
alter table public.egg_order_items enable row level security;
alter table public.egg_payments enable row level security;
alter table public.egg_inventory_movements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['egg_suppliers','egg_grades','egg_batches','egg_batch_classifications','egg_customers','egg_orders','egg_order_items','egg_payments','egg_inventory_movements']
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

grant select,insert,update,delete on public.egg_suppliers,public.egg_grades,public.egg_batches,public.egg_batch_classifications,public.egg_customers,public.egg_orders,public.egg_order_items,public.egg_payments,public.egg_inventory_movements to authenticated;
grant all privileges on public.egg_suppliers,public.egg_grades,public.egg_batches,public.egg_batch_classifications,public.egg_customers,public.egg_orders,public.egg_order_items,public.egg_payments,public.egg_inventory_movements to service_role;

create or replace view public.egg_inventory_stock
with (security_invoker=true)
as
select
  m.company_id,
  m.grade_id,
  g.code,
  g.name,
  g.min_weight_g,
  g.max_weight_g,
  sum(m.quantity_eggs)::bigint as stock_eggs,
  floor(sum(m.quantity_eggs)/30.0)::bigint as full_trays_30,
  case
    when sum(case when m.quantity_eggs>0 then m.quantity_eggs else 0 end)>0
    then round(
      sum(case when m.quantity_eggs>0 then m.quantity_eggs*m.unit_cost else 0 end)
      / sum(case when m.quantity_eggs>0 then m.quantity_eggs else 0 end)
    ,6)
    else 0
  end as avg_cost_per_egg
from public.egg_inventory_movements m
join public.egg_grades g on g.id=m.grade_id
group by m.company_id,m.grade_id,g.code,g.name,g.min_weight_g,g.max_weight_g;

grant select on public.egg_inventory_stock to authenticated, service_role;

create or replace function public.egg_seed_default_grades(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  insert into public.egg_grades(company_id,code,name,min_weight_g,max_weight_g,sort_order)
  values
    (p_company_id,'JUMBO','Jumbo',70,null,10),
    (p_company_id,'XL','Extra grande',65,69.99,20),
    (p_company_id,'L','Grande',60,64.99,30),
    (p_company_id,'M','Mediano',55,59.99,40),
    (p_company_id,'S','Pequeño',50,54.99,50),
    (p_company_id,'SECOND','Segunda',null,49.99,60)
  on conflict(company_id,code) do nothing;
end;
$$;

create or replace function public.egg_seed_grades_for_vertical()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare v_code text;
begin
  select code into v_code from public.saas_verticals where id=new.vertical_id;
  if v_code='EGG_WHOLESALE' then
    perform public.egg_seed_default_grades(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_egg_seed_grades_for_vertical on public.saas_company_subscriptions;
create trigger trg_egg_seed_grades_for_vertical
after insert or update of vertical_id on public.saas_company_subscriptions
for each row execute function public.egg_seed_grades_for_vertical();

do $$
declare r record;
begin
  for r in
    select s.company_id
    from public.saas_company_subscriptions s
    join public.saas_verticals v on v.id=s.vertical_id
    where v.code='EGG_WHOLESALE'
  loop
    perform public.egg_seed_default_grades(r.company_id);
  end loop;
end $$;

create or replace function public.egg_receive_batch(
  p_company_id uuid,
  p_supplier_id uuid,
  p_total_eggs integer,
  p_total_cost numeric,
  p_received_at date default current_date,
  p_source_reference text default '',
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
  p_batch_id uuid,
  p_grade_id uuid,
  p_quantity_eggs integer,
  p_damaged_eggs integer default 0,
  p_avg_weight_g numeric default null
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
  if not public.egg_company_member(v_batch.company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if not exists(select 1 from public.egg_grades where id=p_grade_id and company_id=v_batch.company_id and active=true) then raise exception 'Clasificación inválida.'; end if;
  if coalesce(p_quantity_eggs,0)<0 or coalesce(p_damaged_eggs,0)<0 then raise exception 'Cantidades inválidas.'; end if;
  if coalesce(p_quantity_eggs,0)+coalesce(p_damaged_eggs,0)<=0 then raise exception 'Ingresá una cantidad a clasificar.'; end if;
  if exists(select 1 from public.egg_batch_classifications where batch_id=p_batch_id and grade_id=p_grade_id) then raise exception 'Ese tamaño ya fue registrado en este lote.'; end if;
  select coalesce(sum(quantity_eggs+damaged_eggs),0) into v_used from public.egg_batch_classifications where batch_id=p_batch_id;
  if v_used+p_quantity_eggs+p_damaged_eggs>v_batch.total_eggs then raise exception 'La clasificación supera los huevos recibidos en el lote.'; end if;
  insert into public.egg_batch_classifications(company_id,batch_id,grade_id,quantity_eggs,damaged_eggs,avg_weight_g,created_by)
  values(v_batch.company_id,p_batch_id,p_grade_id,p_quantity_eggs,p_damaged_eggs,p_avg_weight_g,auth.uid())
  returning id into v_id;
  v_unit_cost:=case when v_batch.total_eggs>0 then v_batch.total_cost/v_batch.total_eggs else 0 end;
  if p_quantity_eggs>0 then
    insert into public.egg_inventory_movements(company_id,grade_id,batch_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
    values(v_batch.company_id,p_grade_id,p_batch_id,'RECEIPT',p_quantity_eggs,v_unit_cost,'Entrada por clasificación de lote',auth.uid());
  end if;
  if v_used+p_quantity_eggs+p_damaged_eggs=v_batch.total_eggs then
    update public.egg_batches set status='CLASSIFIED',updated_at=now() where id=p_batch_id;
  end if;
  return v_id;
end;
$$;

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
declare v_order_id uuid; v_order_number text; v_total_eggs integer; v_stock bigint; v_total numeric; v_credit_days integer; v_due date;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if not exists(select 1 from public.egg_customers where id=p_customer_id and company_id=p_company_id and active=true) then raise exception 'Cliente inválido.'; end if;
  if not exists(select 1 from public.egg_grades where id=p_grade_id and company_id=p_company_id and active=true) then raise exception 'Clasificación inválida.'; end if;
  if coalesce(p_quantity_units,0)<=0 or coalesce(p_eggs_per_unit,0)<=0 then raise exception 'Cantidad inválida.'; end if;
  if coalesce(p_unit_price,0)<0 then raise exception 'Precio inválido.'; end if;
  v_total_eggs:=round(p_quantity_units*p_eggs_per_unit);
  select coalesce(sum(quantity_eggs),0) into v_stock from public.egg_inventory_movements where company_id=p_company_id and grade_id=p_grade_id;
  if v_stock<v_total_eggs then raise exception 'Inventario insuficiente para este pedido. Disponible: % huevos.',v_stock; end if;
  select credit_days into v_credit_days from public.egg_customers where id=p_customer_id;
  v_total:=round((p_quantity_units*p_unit_price)::numeric,2);
  v_order_id:=gen_random_uuid();
  v_order_number:='EGG-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,6));
  v_due:=case when upper(coalesce(p_payment_type,'CREDIT'))='CREDIT' and coalesce(v_credit_days,0)>0 then current_date+v_credit_days else current_date end;
  insert into public.egg_orders(id,company_id,customer_id,order_number,order_date,due_date,status,payment_type,subtotal,total,paid_amount,notes,created_by)
  values(v_order_id,p_company_id,p_customer_id,v_order_number,current_date,v_due,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'PAID' else 'CONFIRMED' end,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'CASH' else 'CREDIT' end,
    v_total,v_total,case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then v_total else 0 end,coalesce(p_notes,''),auth.uid());
  insert into public.egg_order_items(company_id,order_id,grade_id,presentation,quantity_units,eggs_per_unit,total_eggs,unit_price,line_total)
  values(p_company_id,v_order_id,p_grade_id,coalesce(nullif(trim(p_presentation),''),'TRAY'),p_quantity_units,p_eggs_per_unit,v_total_eggs,p_unit_price,v_total);
  insert into public.egg_inventory_movements(company_id,grade_id,order_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
  values(p_company_id,p_grade_id,v_order_id,'SALE',-v_total_eggs,0,'Salida por pedido '||v_order_number,auth.uid());
  if upper(coalesce(p_payment_type,'CREDIT'))='CASH' and v_total>0 then
    insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
    values(p_company_id,v_order_id,v_total,'CASH','Pago al contado',auth.uid());
  end if;
  return v_order_id;
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
declare v_order public.egg_orders%rowtype; v_id uuid; v_paid numeric;
begin
  select * into v_order from public.egg_orders where id=p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.egg_company_member(v_order.company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if v_order.status='CANCELLED' then raise exception 'No se puede abonar a un pedido cancelado.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El abono debe ser mayor que cero.'; end if;
  insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
  values(v_order.company_id,p_order_id,p_amount,
    case when upper(coalesce(p_method,'CASH')) in ('CASH','TRANSFER','CHECK','OTHER') then upper(p_method) else 'OTHER' end,
    coalesce(p_reference,''),auth.uid())
  returning id into v_id;
  v_paid:=least(v_order.total,v_order.paid_amount+p_amount);
  update public.egg_orders
  set paid_amount=v_paid,status=case when v_paid>=total then 'PAID' else status end,updated_at=now()
  where id=p_order_id;
  return v_id;
end;
$$;

grant execute on function public.egg_receive_batch(uuid,uuid,integer,numeric,date,text,text) to authenticated;
grant execute on function public.egg_classify_batch(uuid,uuid,integer,integer,numeric) to authenticated;
grant execute on function public.egg_create_order(uuid,uuid,uuid,text,numeric,integer,numeric,text,text) to authenticated;
grant execute on function public.egg_record_payment(uuid,numeric,text,text) to authenticated;

insert into public.saas_modules(code,name,description,is_core,active)
values('EGG_OPERATIONS','Operación Mayorista de Huevos','Lotes, clasificación, inventario, pedidos, crédito y cobros.',false,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,active=true;

insert into public.saas_vertical_modules(vertical_id,module_id,enabled_by_default)
select v.id,m.id,true
from public.saas_verticals v
join public.saas_modules m on m.code='EGG_OPERATIONS'
where v.code='EGG_WHOLESALE'
on conflict(vertical_id,module_id) do update set enabled_by_default=true;

insert into public.saas_plan_modules(plan_id,module_id,enabled)
select p.id,m.id,true
from public.saas_plans p
join public.saas_modules m on m.code='EGG_OPERATIONS'
where p.active=true and p.code<>'OWNER_INTERNAL'
on conflict(plan_id,module_id) do update set enabled=true;
