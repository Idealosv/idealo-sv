-- IDEALO SV · Productos 360
-- Extensión aditiva del catálogo de productos/trabajos terminados.

alter table if exists public.finished_products
  add column if not exists sku text,
  add column if not exists subcategory text,
  add column if not exists short_description text,
  add column if not exists technical_description text,
  add column if not exists cost_estimate numeric(12,2) not null default 0,
  add column if not exists labor_cost numeric(12,2) not null default 0,
  add column if not exists installation_cost numeric(12,2) not null default 0,
  add column if not exists minimum_price numeric(12,2) not null default 0,
  add column if not exists price_per_m2 numeric(12,2) not null default 0,
  add column if not exists width numeric(12,4),
  add column if not exists height numeric(12,4),
  add column if not exists dimension_unit text not null default 'm',
  add column if not exists tax_rate numeric(5,2) not null default 13,
  add column if not exists taxable boolean not null default true,
  add column if not exists design_included boolean not null default false,
  add column if not exists installation_included boolean not null default false,
  add column if not exists requires_production boolean not null default true,
  add column if not exists affects_inventory boolean not null default false,
  add column if not exists min_quantity numeric(12,2) not null default 1,
  add column if not exists lead_time_days integer,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists image_url text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists internal_notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.finished_products
set status = case when coalesce(active, true) then 'ACTIVE' else 'INACTIVE' end
where status is null or status = '';

create unique index if not exists finished_products_company_sku_unique
  on public.finished_products(company_id, lower(sku))
  where sku is not null and length(trim(sku)) > 0;
create index if not exists finished_products_company_category_idx on public.finished_products(company_id, category);
create index if not exists finished_products_company_status_idx on public.finished_products(company_id, status);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete cascade,
  name text not null,
  sku text,
  attributes jsonb not null default '{}'::jsonb,
  sale_price numeric(12,2),
  cost_estimate numeric(12,2),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id, sort_order, name);
create unique index if not exists product_variants_company_sku_unique
  on public.product_variants(company_id, lower(sku))
  where sku is not null and length(trim(sku)) > 0;

create table if not exists public.product_price_tiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete cascade,
  min_quantity numeric(12,2) not null,
  max_quantity numeric(12,2),
  unit_price numeric(12,2) not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_price_tier_qty_check check (min_quantity > 0 and (max_quantity is null or max_quantity >= min_quantity)),
  constraint product_price_tier_price_check check (unit_price >= 0)
);
create index if not exists product_price_tiers_product_idx on public.product_price_tiers(product_id, min_quantity);

alter table public.product_variants enable row level security;
alter table public.product_price_tiers enable row level security;

drop policy if exists product_variants_company_access on public.product_variants;
create policy product_variants_company_access on public.product_variants
for all to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = product_variants.company_id and cm.user_id = auth.uid()
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = product_variants.company_id and cm.user_id = auth.uid()
));

drop policy if exists product_price_tiers_company_access on public.product_price_tiers;
create policy product_price_tiers_company_access on public.product_price_tiers
for all to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = product_price_tiers.company_id and cm.user_id = auth.uid()
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = product_price_tiers.company_id and cm.user_id = auth.uid()
));

create or replace function public.idealo_products_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_finished_products_touch on public.finished_products;
create trigger trg_finished_products_touch
before update on public.finished_products
for each row execute function public.idealo_products_touch_updated_at();

drop trigger if exists trg_product_variants_touch on public.product_variants;
create trigger trg_product_variants_touch
before update on public.product_variants
for each row execute function public.idealo_products_touch_updated_at();
