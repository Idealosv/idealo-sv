-- IDEALO Jurídico: núcleo operativo multiempresa
create table if not exists public.legal_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  case_number text not null,
  title text not null,
  practice_area text not null default 'General',
  court_name text,
  court_case_number text,
  opposing_party text,
  responsible_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','ON_HOLD','CLOSED','ARCHIVED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  opened_at date not null default current_date,
  closed_at date,
  description text not null default '',
  confidential_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, case_number)
);

create table if not exists public.legal_case_parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  party_type text not null default 'OTHER',
  name text not null,
  document_number text,
  phone text,
  email text,
  address text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.legal_case_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  event_type text not null default 'NOTE',
  title text not null,
  description text not null default '',
  event_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_deadlines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  reminder_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING','DONE','CANCELLED')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.legal_cases(id) on delete cascade,
  name text not null,
  document_type text not null default 'OTHER',
  storage_path text,
  external_url text,
  version integer not null default 1 check (version > 0),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists legal_cases_company_status_idx on public.legal_cases(company_id, status, opened_at desc);
create index if not exists legal_deadlines_company_due_idx on public.legal_deadlines(company_id, status, due_at);
create index if not exists legal_case_events_case_idx on public.legal_case_events(case_id, event_at desc);
create index if not exists legal_documents_case_idx on public.legal_documents(case_id, created_at desc);

alter table public.legal_cases enable row level security;
alter table public.legal_case_parties enable row level security;
alter table public.legal_case_events enable row level security;
alter table public.legal_deadlines enable row level security;
alter table public.legal_documents enable row level security;

create policy "members_manage_legal_cases" on public.legal_cases for all to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = legal_cases.company_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.company_members cm where cm.company_id = legal_cases.company_id and cm.user_id = auth.uid()));

create policy "members_manage_legal_case_parties" on public.legal_case_parties for all to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = legal_case_parties.company_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.company_members cm where cm.company_id = legal_case_parties.company_id and cm.user_id = auth.uid()));

create policy "members_manage_legal_case_events" on public.legal_case_events for all to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = legal_case_events.company_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.company_members cm where cm.company_id = legal_case_events.company_id and cm.user_id = auth.uid()));

create policy "members_manage_legal_deadlines" on public.legal_deadlines for all to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = legal_deadlines.company_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.company_members cm where cm.company_id = legal_deadlines.company_id and cm.user_id = auth.uid()));

create policy "members_manage_legal_documents" on public.legal_documents for all to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id = legal_documents.company_id and cm.user_id = auth.uid()))
with check (exists (select 1 from public.company_members cm where cm.company_id = legal_documents.company_id and cm.user_id = auth.uid()));

grant select, insert, update, delete on public.legal_cases, public.legal_case_parties, public.legal_case_events, public.legal_deadlines, public.legal_documents to authenticated;
grant all privileges on public.legal_cases, public.legal_case_parties, public.legal_case_events, public.legal_deadlines, public.legal_documents to service_role;
