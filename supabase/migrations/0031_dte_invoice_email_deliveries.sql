create table if not exists public.invoice_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_email text not null,
  delivery_kind text not null default 'automatic' check (delivery_kind in ('automatic','manual')),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoice_email_deliveries_one_auto_per_dte
  on public.invoice_email_deliveries(dte_document_id)
  where delivery_kind = 'automatic';

create index if not exists invoice_email_deliveries_company_created_idx
  on public.invoice_email_deliveries(company_id, created_at desc);

alter table public.invoice_email_deliveries enable row level security;
revoke all on public.invoice_email_deliveries from anon, authenticated;
