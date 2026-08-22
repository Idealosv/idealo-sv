create table if not exists public.dte_test_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_document_id uuid references public.dte_documents(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

alter table public.dte_test_scenarios enable row level security;

create policy "members can read dte test scenarios"
on public.dte_test_scenarios for select
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = dte_test_scenarios.company_id
    and cm.user_id = auth.uid()
));

create policy "members can insert dte test scenarios"
on public.dte_test_scenarios for insert
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = dte_test_scenarios.company_id
    and cm.user_id = auth.uid()
));

create policy "members can update dte test scenarios"
on public.dte_test_scenarios for update
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = dte_test_scenarios.company_id
    and cm.user_id = auth.uid()
));

create index if not exists idx_dte_test_scenarios_company
on public.dte_test_scenarios(company_id, sort_order);
