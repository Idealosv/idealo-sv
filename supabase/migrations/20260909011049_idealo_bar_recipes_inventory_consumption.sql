create table if not exists public.bar_recipe_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_per_unit numeric(18,6) not null check (quantity_per_unit > 0),
  waste_percent numeric(7,4) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  active boolean not null default true,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,product_id,inventory_item_id)
);

create index if not exists bar_recipe_components_product_idx on public.bar_recipe_components(company_id,product_id) where active=true;
create index if not exists bar_recipe_components_inventory_idx on public.bar_recipe_components(inventory_item_id) where active=true;

create table if not exists public.bar_inventory_consumptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.bar_orders(id) on delete restrict,
  order_item_id uuid not null references public.bar_order_items(id) on delete restrict,
  recipe_component_id uuid not null references public.bar_recipe_components(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(order_item_id,recipe_component_id)
);

create index if not exists bar_inventory_consumptions_order_idx on public.bar_inventory_consumptions(company_id,order_id);
create index if not exists bar_inventory_consumptions_item_idx on public.bar_inventory_consumptions(inventory_item_id);
create index if not exists bar_inventory_consumptions_movement_idx on public.bar_inventory_consumptions(inventory_movement_id);

alter table public.bar_recipe_components enable row level security;
alter table public.bar_inventory_consumptions enable row level security;

drop policy if exists bar_recipe_components_read on public.bar_recipe_components;
create policy bar_recipe_components_read on public.bar_recipe_components for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_recipe_components_write on public.bar_recipe_components;
create policy bar_recipe_components_write on public.bar_recipe_components for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

drop policy if exists bar_inventory_consumptions_read on public.bar_inventory_consumptions;
create policy bar_inventory_consumptions_read on public.bar_inventory_consumptions for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_inventory_consumptions_write on public.bar_inventory_consumptions;
create policy bar_inventory_consumptions_write on public.bar_inventory_consumptions for all to authenticated using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

grant select,insert,update,delete on public.bar_recipe_components to authenticated;
grant select,insert,update,delete on public.bar_inventory_consumptions to authenticated;
grant all on public.bar_recipe_components to service_role;
grant all on public.bar_inventory_consumptions to service_role;

create or replace function public.guard_bar_recipe_component_company()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not exists(select 1 from public.finished_products p where p.id=new.product_id and p.company_id=new.company_id) then
    raise exception 'El producto de la receta no pertenece a esta empresa';
  end if;
  if not exists(select 1 from public.inventory_items i where i.id=new.inventory_item_id and i.company_id=new.company_id and i.active=true and i.deleted_at is null) then
    raise exception 'El insumo no pertenece al inventario activo de esta empresa';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists bar_recipe_component_company_guard on public.bar_recipe_components;
create trigger bar_recipe_component_company_guard before insert or update on public.bar_recipe_components for each row execute function public.guard_bar_recipe_component_company();

create or replace function public.bar_consume_recipe_on_send()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  r record;
  v_quantity numeric(18,6);
  v_movement_id uuid;
  v_order public.bar_orders%rowtype;
begin
  if not (old.status='new' and new.status='sent') then return new; end if;
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_operate(new.company_id) then raise exception 'Sin permiso para operar IDEALO BAR'; end if;

  select * into v_order from public.bar_orders where id=new.order_id and company_id=new.company_id;
  if not found then raise exception 'Pedido de bar no válido'; end if;

  for r in
    select rc.*,i.average_cost,i.warehouse_id,i.location_id,i.name as inventory_name
    from public.bar_recipe_components rc
    join public.inventory_items i on i.id=rc.inventory_item_id and i.company_id=rc.company_id
    where rc.company_id=new.company_id and rc.product_id=new.product_id and rc.active=true
    order by rc.created_at,rc.id
  loop
    v_quantity:=round((new.quantity*r.quantity_per_unit*(1+(r.waste_percent/100.0)))::numeric,6);
    if v_quantity<=0 then continue; end if;

    insert into public.inventory_movements(
      company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,
      document_type,document_id,reference,notes,created_by
    ) values (
      new.company_id,r.inventory_item_id,'SALE_OUT',v_quantity,coalesce(r.average_cost,0),r.warehouse_id,r.location_id,
      'BAR_ORDER',new.order_id,coalesce(v_order.order_code,new.order_id::text),
      'IDEALO BAR · '||new.item_name||' · '||r.inventory_name,auth.uid()
    ) returning id into v_movement_id;

    insert into public.bar_inventory_consumptions(
      company_id,order_id,order_item_id,recipe_component_id,inventory_item_id,inventory_movement_id,quantity,unit_cost,created_by
    ) values (
      new.company_id,new.order_id,new.id,r.id,r.inventory_item_id,v_movement_id,v_quantity,coalesce(r.average_cost,0),auth.uid()
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists bar_order_item_recipe_consume on public.bar_order_items;
create trigger bar_order_item_recipe_consume before update of status on public.bar_order_items for each row when (old.status='new' and new.status='sent') execute function public.bar_consume_recipe_on_send();

create or replace function public.classify_bar_menu_item()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare v_name text;
begin
  select lower(coalesce(name,'')) into v_name from public.finished_products where id=new.product_id and company_id=new.company_id;
  if v_name ~ '(cerveza|pilsener|suprema|golden|corona|modelo|heineken|regia|stella|budweiser|balde|hielerazo|hielarazo)' then
    new.category:='Cervezas'; new.station:='bar'; new.emoji:='🍺';
  end if;
  return new;
end;
$$;

drop trigger if exists bar_menu_item_classification on public.bar_menu_items;
create trigger bar_menu_item_classification before insert or update of product_id on public.bar_menu_items for each row execute function public.classify_bar_menu_item();

update public.bar_menu_items m set product_id=m.product_id where exists (
  select 1 from public.finished_products p where p.id=m.product_id and p.company_id=m.company_id and lower(p.name) ~ '(balde|hielerazo|hielarazo)'
);