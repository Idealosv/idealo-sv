-- Compatibilidad Cotizaciones 360 con el esquema actual de Clientes 360.
-- Expone alias de solo lectura que siguen automáticamente a tax_id y business_activity.
alter table public.clients
  add column if not exists nit text generated always as (tax_id) stored,
  add column if not exists giro text generated always as (business_activity) stored;

create index if not exists clients_company_nit_idx on public.clients(company_id, nit) where nit is not null and nit <> '';
