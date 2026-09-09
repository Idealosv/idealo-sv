create table if not exists public.bar_tables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  area text not null default 'Salón',
  capacity integer not null default 4 check (capacity > 0 and capacity <= 50),
  status text not null default 'available' check (status in ('available','occupied','awaiting_payment','reserved','inactive')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.bar_menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete restrict,
  display_name text,
  category text not null default 'Comida',
  station text not null default 'kitchen' check (station in ('bar','kitchen')),
  sale_price_override numeric(14,2) check (sale_price_override is null or sale_price_override >= 0),
  emoji text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id)
);

create table if not exists public.bar_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_id uuid references public.bar_tables(id) on delete set null,
  order_code text not null default ('BAR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  order_type text not null default 'table' check (order_type in ('table','takeaway','delivery')),
  status text not null default 'open' check (status in ('open','sent','preparing','ready','served','paid','cancelled')),
  customer_name text,
  customer_phone text,
  delivery_address text,
  notes text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tip_total numeric(14,2) not null default 0 check (tip_total >= 0),
  total numeric(14,2) generated always as (greatest(subtotal - discount_total + tip_total, 0)) stored,
  opened_by uuid default auth.uid(),
  closed_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_code)
);

create table if not exists public.bar_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.bar_orders(id) on delete cascade,
  menu_item_id uuid references public.bar_menu_items(id) on delete set null,
  product_id uuid not null references public.finished_products(id) on delete restrict,
  item_name text not null,
  station text not null check (station in ('bar','kitchen')),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  status text not null default 'new' check (status in ('new','sent','preparing','ready','served','cancelled')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bar_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.bar_orders(id) on delete restrict,
  cash_register_session_id uuid references public.cash_register_sessions(id) on delete set null,
  method text not null check (method in ('cash','card','transfer','other')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  received_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists bar_tables_company_status_idx on public.bar_tables(company_id, status, sort_order);
create index if not exists bar_menu_items_company_station_idx on public.bar_menu_items(company_id, station, active, sort_order);
create index if not exists bar_orders_company_status_idx on public.bar_orders(company_id, status, opened_at desc);
create index if not exists bar_orders_table_status_idx on public.bar_orders(table_id, status) where table_id is not null;
create index if not exists bar_order_items_order_idx on public.bar_order_items(order_id, status, station);
create index if not exists bar_order_items_company_station_idx on public.bar_order_items(company_id, station, status, created_at);
create index if not exists bar_payments_order_idx on public.bar_payments(order_id, created_at);

create or replace function public.bar_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bar_recalculate_order_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order uuid;
begin
  target_order := coalesce(new.order_id, old.order_id);
  update public.bar_orders o
     set subtotal = coalesce((
       select sum(i.line_total)
       from public.bar_order_items i
       where i.order_id = target_order
         and i.status <> 'cancelled'
     ), 0),
         updated_at = now()
   where o.id = target_order;
  return coalesce(new, old);
end;
$$;

revoke all on function public.bar_touch_updated_at() from public, anon, authenticated;
revoke all on function public.bar_recalculate_order_totals() from public, anon, authenticated;

drop trigger if exists bar_tables_touch_updated_at on public.bar_tables;
create trigger bar_tables_touch_updated_at before update on public.bar_tables for each row execute function public.bar_touch_updated_at();
drop trigger if exists bar_menu_items_touch_updated_at on public.bar_menu_items;
create trigger bar_menu_items_touch_updated_at before update on public.bar_menu_items for each row execute function public.bar_touch_updated_at();
drop trigger if exists bar_orders_touch_updated_at on public.bar_orders;
create trigger bar_orders_touch_updated_at before update on public.bar_orders for each row execute function public.bar_touch_updated_at();
drop trigger if exists bar_order_items_touch_updated_at on public.bar_order_items;
create trigger bar_order_items_touch_updated_at before update on public.bar_order_items for each row execute function public.bar_touch_updated_at();
drop trigger if exists bar_order_items_recalculate_order on public.bar_order_items;
create trigger bar_order_items_recalculate_order after insert or update or delete on public.bar_order_items for each row execute function public.bar_recalculate_order_totals();

alter table public.bar_tables enable row level security;
alter table public.bar_menu_items enable row level security;
alter table public.bar_orders enable row level security;
alter table public.bar_order_items enable row level security;
alter table public.bar_payments enable row level security;

revoke all on table public.bar_tables, public.bar_menu_items, public.bar_orders, public.bar_order_items, public.bar_payments from anon, authenticated;
grant select, insert, update, delete on table public.bar_tables, public.bar_menu_items, public.bar_orders, public.bar_order_items to authenticated;
grant select, insert on table public.bar_payments to authenticated;

drop policy if exists bar_tables_select on public.bar_tables;
create policy bar_tables_select on public.bar_tables for select to authenticated using (public.is_company_member(company_id));
drop policy if exists bar_tables_insert on public.bar_tables;
create policy bar_tables_insert on public.bar_tables for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists bar_tables_update on public.bar_tables;
create policy bar_tables_update on public.bar_tables for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists bar_tables_delete on public.bar_tables;
create policy bar_tables_delete on public.bar_tables for delete to authenticated using (public.is_company_member(company_id));

drop policy if exists bar_menu_items_select on public.bar_menu_items;
create policy bar_menu_items_select on public.bar_menu_items for select to authenticated using (public.is_company_member(company_id));
drop policy if exists bar_menu_items_insert on public.bar_menu_items;
create policy bar_menu_items_insert on public.bar_menu_items for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists bar_menu_items_update on public.bar_menu_items;
create policy bar_menu_items_update on public.bar_menu_items for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists bar_menu_items_delete on public.bar_menu_items;
create policy bar_menu_items_delete on public.bar_menu_items for delete to authenticated using (public.is_company_member(company_id));

drop policy if exists bar_orders_select on public.bar_orders;
create policy bar_orders_select on public.bar_orders for select to authenticated using (public.is_company_member(company_id));
drop policy if exists bar_orders_insert on public.bar_orders;
create policy bar_orders_insert on public.bar_orders for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists bar_orders_update on public.bar_orders;
create policy bar_orders_update on public.bar_orders for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists bar_orders_delete on public.bar_orders;
create policy bar_orders_delete on public.bar_orders for delete to authenticated using (public.is_company_member(company_id));

drop policy if exists bar_order_items_select on public.bar_order_items;
create policy bar_order_items_select on public.bar_order_items for select to authenticated using (public.is_company_member(company_id));
drop policy if exists bar_order_items_insert on public.bar_order_items;
create policy bar_order_items_insert on public.bar_order_items for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists bar_order_items_update on public.bar_order_items;
create policy bar_order_items_update on public.bar_order_items for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists bar_order_items_delete on public.bar_order_items;
create policy bar_order_items_delete on public.bar_order_items for delete to authenticated using (public.is_company_member(company_id));

drop policy if exists bar_payments_select on public.bar_payments;
create policy bar_payments_select on public.bar_payments for select to authenticated using (public.is_company_member(company_id));
drop policy if exists bar_payments_insert on public.bar_payments;
create policy bar_payments_insert on public.bar_payments for insert to authenticated with check (public.is_company_member(company_id));
