-- IDEALO SV: núcleo comercial SaaS multiempresa
-- Base reutilizable para vender IDEALO por rubros, planes y suscripciones.

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  monthly_price numeric(12,2) not null default 0 check (monthly_price >= 0),
  currency text not null default 'USD',
  max_users integer check (max_users is null or max_users > 0),
  max_branches integer check (max_branches is null or max_branches > 0),
  storage_mb integer check (storage_mb is null or storage_mb > 0),
  dte_enabled boolean not null default false,
  ai_enabled boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_verticals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  is_core boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.saas_vertical_modules (
  vertical_id uuid not null references public.saas_verticals(id) on delete cascade,
  module_id uuid not null references public.saas_modules(id) on delete cascade,
  enabled_by_default boolean not null default true,
  primary key (vertical_id, module_id)
);

create table if not exists public.saas_plan_modules (
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  module_id uuid not null references public.saas_modules(id) on delete cascade,
  enabled boolean not null default true,
  primary key (plan_id, module_id)
);

create type public.saas_subscription_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');

create table if not exists public.saas_company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  vertical_id uuid not null references public.saas_verticals(id),
  status public.saas_subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_company_subscriptions_status_idx on public.saas_company_subscriptions(status);
create index if not exists saas_company_subscriptions_period_end_idx on public.saas_company_subscriptions(current_period_end);

create table if not exists public.saas_company_module_overrides (
  company_id uuid not null references public.companies(id) on delete cascade,
  module_id uuid not null references public.saas_modules(id) on delete cascade,
  enabled boolean not null,
  reason text not null default '',
  updated_at timestamptz not null default now(),
  primary key (company_id, module_id)
);

create table if not exists public.saas_billing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.saas_company_subscriptions(id) on delete set null,
  event_type text not null,
  amount numeric(12,2),
  currency text not null default 'USD',
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists saas_billing_events_company_idx on public.saas_billing_events(company_id, occurred_at desc);

insert into public.saas_plans (code, name, description, monthly_price, max_users, max_branches, storage_mb, dte_enabled, ai_enabled, sort_order)
values
  ('BASIC', 'Básico', 'Operación esencial para pequeños negocios.', 25, 3, 1, 1024, false, false, 10),
  ('PRO', 'Profesional', 'Operación completa con DTE y mayor capacidad.', 50, 10, 3, 5120, true, true, 20),
  ('BUSINESS', 'Empresa', 'Capacidad ampliada para empresas y sucursales.', 100, 50, 10, 20480, true, true, 30)
on conflict (code) do nothing;

insert into public.saas_verticals (code, name, description)
values
  ('ADVERTISING', 'Publicidad', 'Agencias de publicidad, impresión, producción e instalación.'),
  ('LEGAL', 'Jurídico', 'Abogados, bufetes, expedientes y gestión legal.'),
  ('RESTAURANT', 'Restaurante y Bar', 'Mesas, comandas, cocina, barra y caja.'),
  ('WORKSHOP', 'Taller', 'Vehículos, órdenes de servicio, repuestos y trabajos.'),
  ('COMMERCE', 'Comercio', 'Ventas, inventario, compras y caja.'),
  ('SERVICES', 'Servicios', 'Empresas de servicios y órdenes de trabajo.')
on conflict (code) do nothing;

insert into public.saas_modules (code, name, description, is_core)
values
  ('DASHBOARD', 'Dashboard', 'Indicadores y operación general.', true),
  ('USERS', 'Usuarios', 'Usuarios, roles y permisos.', true),
  ('CLIENTS', 'Clientes', 'CRM y expediente comercial del cliente.', true),
  ('SUPPLIERS', 'Proveedores', 'Gestión de proveedores.', true),
  ('CASH', 'Caja y Bancos', 'Caja, bancos y movimientos.', true),
  ('REPORTS', 'Reportes', 'Reportería operativa y financiera.', true),
  ('SECURITY', 'Seguridad', 'Auditoría y controles de seguridad.', true),
  ('DTE', 'Facturación DTE', 'Facturación electrónica para El Salvador.', false),
  ('AI', 'Asistente IA', 'Funciones de asistencia inteligente.', false),
  ('QUOTES', 'Cotizaciones', 'Cotización y seguimiento comercial.', false),
  ('PRODUCTION', 'Producción', 'Órdenes y control de producción.', false),
  ('INVENTORY', 'Inventario', 'Existencias, movimientos y control de stock.', false),
  ('PURCHASES', 'Compras', 'Compras y recepciones.', false),
  ('LEGAL_CASES', 'Expedientes Jurídicos', 'Casos, expedientes y actuaciones legales.', false),
  ('RESTAURANT_POS', 'Mesas y Comandas', 'Operación de restaurante, cocina y barra.', false),
  ('WORKSHOP_ORDERS', 'Órdenes de Taller', 'Vehículos y órdenes de servicio.', false)
on conflict (code) do nothing;

alter table public.saas_plans enable row level security;
alter table public.saas_verticals enable row level security;
alter table public.saas_modules enable row level security;
alter table public.saas_vertical_modules enable row level security;
alter table public.saas_plan_modules enable row level security;
alter table public.saas_company_subscriptions enable row level security;
alter table public.saas_company_module_overrides enable row level security;
alter table public.saas_billing_events enable row level security;

create policy "authenticated_read_active_saas_plans" on public.saas_plans for select to authenticated using (active = true);
create policy "authenticated_read_active_saas_verticals" on public.saas_verticals for select to authenticated using (active = true);
create policy "authenticated_read_active_saas_modules" on public.saas_modules for select to authenticated using (active = true);
create policy "authenticated_read_vertical_modules" on public.saas_vertical_modules for select to authenticated using (true);
create policy "authenticated_read_plan_modules" on public.saas_plan_modules for select to authenticated using (true);

create policy "company_members_read_subscription" on public.saas_company_subscriptions for select to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = saas_company_subscriptions.company_id and cm.user_id = auth.uid()));

create policy "company_members_read_module_overrides" on public.saas_company_module_overrides for select to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = saas_company_module_overrides.company_id and cm.user_id = auth.uid()));

create policy "company_owner_admin_read_billing" on public.saas_billing_events for select to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = saas_billing_events.company_id and cm.user_id = auth.uid() and cm.role in ('owner', 'admin')));

grant select on public.saas_plans, public.saas_verticals, public.saas_modules, public.saas_vertical_modules, public.saas_plan_modules to authenticated;
grant select on public.saas_company_subscriptions, public.saas_company_module_overrides, public.saas_billing_events to authenticated;
grant all privileges on public.saas_plans, public.saas_verticals, public.saas_modules, public.saas_vertical_modules, public.saas_plan_modules, public.saas_company_subscriptions, public.saas_company_module_overrides, public.saas_billing_events to service_role;
