create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  business_date date not null default current_date,
  opening_balance numeric(14,2) not null default 0,
  opened_at timestamptz not null default now(),
  opened_by uuid default auth.uid(),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  closing_expected numeric(14,2),
  closing_counted numeric(14,2),
  difference numeric(14,2),
  closed_at timestamptz,
  closed_by uuid,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists cash_register_one_open_per_account
  on public.cash_register_sessions(company_id, cash_account_id)
  where status='OPEN';

create table if not exists public.cash_register_cuts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_register_sessions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  cut_at timestamptz not null default now(),
  expected_balance numeric(14,2) not null,
  income_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  movement_count integer not null default 0,
  created_by uuid default auth.uid(),
  notes text
);

alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_cuts enable row level security;

drop policy if exists cash_register_sessions_member_all on public.cash_register_sessions;
create policy cash_register_sessions_member_all on public.cash_register_sessions
for all to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists cash_register_cuts_member_all on public.cash_register_cuts;
create policy cash_register_cuts_member_all on public.cash_register_cuts
for all to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

grant select, insert, update on public.cash_register_sessions to authenticated;
grant select, insert on public.cash_register_cuts to authenticated;
