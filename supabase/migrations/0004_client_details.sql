-- IDEALO SV: ficha comercial, fiscal y operativa de clientes

alter table public.clients
  add column if not exists client_type text not null default 'company',
  add column if not exists trade_name text,
  add column if not exists nrc text,
  add column if not exists dui text,
  add column if not exists business_activity text,
  add column if not exists whatsapp text,
  add column if not exists contact_name text,
  add column if not exists contact_position text,
  add column if not exists department text,
  add column if not exists municipality text,
  add column if not exists address text,
  add column if not exists payment_terms text not null default 'cash',
  add column if not exists credit_limit numeric(12,2) not null default 0,
  add column if not exists source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_client_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_client_type_check
      check (client_type in ('company', 'person'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_payment_terms_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_payment_terms_check
      check (payment_terms in ('cash', 'credit', 'mixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_credit_limit_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_credit_limit_check
      check (credit_limit >= 0);
  end if;
end
$$;

create index if not exists clients_company_status_idx
  on public.clients (company_id, status);

create index if not exists clients_company_name_idx
  on public.clients (company_id, name);
