-- IDEALO SV: receptor preparado para Factura Electrónica y Crédito Fiscal

alter table public.clients
  add column if not exists preferred_dte_type text not null default '01',
  add column if not exists taxpayer_type text not null default '2',
  add column if not exists document_type text not null default '36',
  add column if not exists document_number text,
  add column if not exists activity_code text,
  add column if not exists department_code text,
  add column if not exists municipality_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_preferred_dte_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_preferred_dte_type_check
      check (preferred_dte_type in ('01', '03'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_taxpayer_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_taxpayer_type_check
      check (taxpayer_type in ('1', '2'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_document_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_document_type_check
      check (document_type in ('36', '13', '37', '03', '02'));
  end if;
end
$$;

create index if not exists clients_company_dte_type_idx
  on public.clients (company_id, preferred_dte_type);

comment on column public.clients.preferred_dte_type is 'CAT-002: 01 Factura, 03 Comprobante de Crédito Fiscal';
comment on column public.clients.taxpayer_type is 'CAT-029: 1 Persona Natural, 2 Persona Jurídica';
comment on column public.clients.document_type is 'CAT-022 tipo de documento de identificación';
comment on column public.clients.activity_code is 'CAT-019 código de actividad económica';
comment on column public.clients.department_code is 'CAT-012 departamento del domicilio fiscal';
comment on column public.clients.municipality_code is 'CAT-013 municipio del domicilio fiscal';
