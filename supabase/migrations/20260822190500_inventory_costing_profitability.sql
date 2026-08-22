create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'MATERIAL' check (category in ('MATERIAL','SUBLIMATION_BLANK','PRINT_MEDIA','INK','RIGID_SHEET','HARDWARE','PACKAGING','OTHER')),
  unit text not null default 'UNIT',
  current_stock numeric(14,3) not null default 0 check (current_stock >= 0),
  average_cost numeric(14,4) not null default 0 check (average_cost >= 0),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  location text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, sku)
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('PURCHASE_IN','CONSUMPTION','ADJUST_IN','ADJUST_OUT','RETURN')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  work_order_id uuid references work_orders(id) on delete set null,
  purchase_id uuid references purchases(id) on delete set null,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists work_order_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  cost_type text not null check (cost_type in ('LABOR','OUTSOURCED','TRANSPORT','INSTALLATION','DESIGN','OTHER')),
  concept text not null,
  amount numeric(12,2) not null check (amount >= 0),
  notes text,
  incurred_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table purchase_items add column if not exists inventory_item_id uuid references inventory_items(id) on delete set null;

create index if not exists inventory_items_company_idx on inventory_items(company_id, active, name);
create index if not exists inventory_movements_item_idx on inventory_movements(company_id, inventory_item_id, created_at desc);
create index if not exists inventory_movements_work_order_idx on inventory_movements(company_id, work_order_id, created_at desc) where work_order_id is not null;
create index if not exists work_order_costs_order_idx on work_order_costs(company_id, work_order_id, incurred_at desc);

alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;
alter table work_order_costs enable row level security;

create policy "members manage inventory items" on inventory_items
for all to authenticated
using (exists(select 1 from company_members cm where cm.company_id=inventory_items.company_id and cm.user_id=(select auth.uid())))
with check (exists(select 1 from company_members cm where cm.company_id=inventory_items.company_id and cm.user_id=(select auth.uid())));

create policy "members read inventory movements" on inventory_movements
for select to authenticated
using (exists(select 1 from company_members cm where cm.company_id=inventory_movements.company_id and cm.user_id=(select auth.uid())));

create policy "members create valid inventory movements" on inventory_movements
for insert to authenticated
with check (
  exists(select 1 from company_members cm where cm.company_id=inventory_movements.company_id and cm.user_id=(select auth.uid()))
  and exists(select 1 from inventory_items i where i.id=inventory_movements.inventory_item_id and i.company_id=inventory_movements.company_id)
  and (inventory_movements.work_order_id is null or exists(select 1 from work_orders w where w.id=inventory_movements.work_order_id and w.company_id=inventory_movements.company_id))
  and (inventory_movements.purchase_id is null or exists(select 1 from purchases p where p.id=inventory_movements.purchase_id and p.company_id=inventory_movements.company_id))
);

create policy "members manage work order costs" on work_order_costs
for all to authenticated
using (
  exists(select 1 from company_members cm where cm.company_id=work_order_costs.company_id and cm.user_id=(select auth.uid()))
  and exists(select 1 from work_orders w where w.id=work_order_costs.work_order_id and w.company_id=work_order_costs.company_id)
)
with check (
  exists(select 1 from company_members cm where cm.company_id=work_order_costs.company_id and cm.user_id=(select auth.uid()))
  and exists(select 1 from work_orders w where w.id=work_order_costs.work_order_id and w.company_id=work_order_costs.company_id)
);

create or replace function apply_inventory_movement() returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_stock numeric(14,3);
  v_avg numeric(14,4);
  v_new_stock numeric(14,3);
  v_new_avg numeric(14,4);
begin
  select current_stock, average_cost into v_stock, v_avg
  from inventory_items
  where id=new.inventory_item_id and company_id=new.company_id
  for update;

  if not found then
    raise exception 'Inventory item does not belong to this company';
  end if;

  if new.movement_type in ('CONSUMPTION','ADJUST_OUT') then
    if new.quantity > v_stock then
      raise exception 'Insufficient stock: available %, requested %', v_stock, new.quantity;
    end if;
    v_new_stock := v_stock - new.quantity;
    update inventory_items set current_stock=v_new_stock, updated_at=now()
    where id=new.inventory_item_id and company_id=new.company_id;
  else
    v_new_stock := v_stock + new.quantity;
    if new.movement_type in ('PURCHASE_IN','ADJUST_IN') and new.unit_cost > 0 then
      v_new_avg := case when v_new_stock > 0 then ((v_stock*v_avg)+(new.quantity*new.unit_cost))/v_new_stock else new.unit_cost end;
    else
      v_new_avg := v_avg;
    end if;
    update inventory_items set current_stock=v_new_stock, average_cost=v_new_avg, updated_at=now()
    where id=new.inventory_item_id and company_id=new.company_id;
  end if;

  return new;
end;
$$;

revoke all on function apply_inventory_movement() from public, anon, authenticated;

drop trigger if exists trg_apply_inventory_movement on inventory_movements;
create trigger trg_apply_inventory_movement
after insert on inventory_movements
for each row execute function apply_inventory_movement();

grant select, insert, update, delete on inventory_items to authenticated;
grant select, insert on inventory_movements to authenticated;
grant select, insert, update, delete on work_order_costs to authenticated;
grant select, insert, update on purchase_items to authenticated;
