create table if not exists public.dte_contingency_batches(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 event_id uuid not null references public.dte_fiscal_events(id) on delete cascade,
 batch_number integer not null check(batch_number>0),
 request_id uuid not null,
 environment text not null check(environment in('test','production')),
 status text not null default 'PENDING',
 document_ids uuid[] not null,
 request_payload jsonb,
 mh_response jsonb,
 query_response jsonb,
 codigo_lote text,
 error_message text,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 submitted_at timestamptz,
 reconciled_at timestamptz,
 unique(event_id,batch_number),
 unique(request_id)
);
alter table public.dte_contingency_batches enable row level security;
drop policy if exists dte_contingency_batches_read on public.dte_contingency_batches;
create policy dte_contingency_batches_read on public.dte_contingency_batches for select to authenticated using(public.erp_can_read(company_id));
revoke all on public.dte_contingency_batches from anon,public;
grant select on public.dte_contingency_batches to authenticated;
create index if not exists idx_dte_contingency_batches_event on public.dte_contingency_batches(event_id,batch_number);
create index if not exists idx_dte_contingency_batches_lote on public.dte_contingency_batches(codigo_lote) where codigo_lote is not null;
