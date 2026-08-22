-- IDEALO SV: bitácora segura e idempotente de transmisión DTE

create table if not exists public.dte_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  dte_type text not null,
  generation_code uuid not null unique,
  control_number text not null unique,
  environment text not null default 'test',
  status text not null default 'DRAFT',
  dte_payload jsonb not null,
  signed_document text,
  mh_response jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dte_documents_environment_check check (environment in ('test', 'production')),
  constraint dte_documents_status_check check (status in (
    'DRAFT', 'SIGNING', 'SIGNED', 'TRANSMITTING', 'PROCESSED', 'REJECTED', 'CONTINGENCY', 'INVALIDATED'
  ))
);

create table if not exists public.dte_transmission_attempts (
  id bigint generated always as identity primary key,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  request_payload jsonb not null,
  response_payload jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (dte_document_id, attempt_number)
);

create index if not exists dte_documents_company_status_idx
  on public.dte_documents(company_id, status, created_at desc);

alter table public.dte_documents enable row level security;
alter table public.dte_transmission_attempts enable row level security;

drop policy if exists "members read company DTE" on public.dte_documents;
create policy "members read company DTE" on public.dte_documents
  for select to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "members read DTE attempts" on public.dte_transmission_attempts;
create policy "members read DTE attempts" on public.dte_transmission_attempts
  for select to authenticated
  using (exists (
    select 1 from public.dte_documents d
    where d.id = dte_document_id and public.is_company_member(d.company_id)
  ));

grant select on public.dte_documents, public.dte_transmission_attempts to authenticated;
grant all on public.dte_documents, public.dte_transmission_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;

comment on table public.dte_documents is 'DTE construidos, firmados y transmitidos; no almacena certificados ni credenciales.';
comment on column public.dte_documents.generation_code is 'UUID v4 en mayúsculas al serializar el DTE para MH.';
