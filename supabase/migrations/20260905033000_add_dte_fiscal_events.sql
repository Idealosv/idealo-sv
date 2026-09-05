create table if not exists public.dte_fiscal_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 dte_document_id uuid references public.dte_documents(id) on delete restrict,
 event_type text not null check (event_type in ('INVALIDATION','CONTINGENCY')),
 environment text not null check (environment in ('test','production')),
 generation_code uuid not null default gen_random_uuid(),
 status text not null default 'DRAFT' check (status in ('DRAFT','SIGNED','TRANSMITTING','PROCESSED','REJECTED','TRANSMISSION_UNKNOWN')),
 payload jsonb not null,
 signed_document text,
 mh_response jsonb,
 mh_message text,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 processed_at timestamptz
);
create unique index if not exists uq_dte_invalidation_event_document on public.dte_fiscal_events(dte_document_id) where event_type='INVALIDATION';
create unique index if not exists uq_dte_fiscal_event_generation on public.dte_fiscal_events(generation_code);
create table if not exists public.dte_fiscal_event_attempts (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.dte_fiscal_events(id) on delete cascade,
 attempt_number integer not null check (attempt_number > 0),
 request_payload jsonb,
 response_payload jsonb,
 error_message text,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 unique(event_id,attempt_number)
);
alter table public.dte_fiscal_events enable row level security;
alter table public.dte_fiscal_event_attempts enable row level security;
drop policy if exists dte_fiscal_events_read on public.dte_fiscal_events;
create policy dte_fiscal_events_read on public.dte_fiscal_events for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists dte_fiscal_event_attempts_read on public.dte_fiscal_event_attempts;
create policy dte_fiscal_event_attempts_read on public.dte_fiscal_event_attempts for select to authenticated using (exists(select 1 from public.dte_fiscal_events e where e.id=event_id and public.erp_can_read(e.company_id)));
revoke all on public.dte_fiscal_events from anon, authenticated;
revoke all on public.dte_fiscal_event_attempts from anon, authenticated;
grant select on public.dte_fiscal_events to authenticated;
grant select on public.dte_fiscal_event_attempts to authenticated;
