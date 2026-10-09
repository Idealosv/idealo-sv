-- Prestadito$ portal for real investors: one ledger, existing inv_* tables.
-- Apply ONLY to dedicated staging after existing 20260921 investor migrations.
-- No account automatically receives access to financial data.
create table if not exists public.inv_portal_enrollments(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id),
 full_name text not null check(length(trim(full_name)) between 3 and 120),
 dui text not null check(length(trim(dui)) between 8 and 20),
 phone text not null check(length(trim(phone)) between 8 and 25),
 email text not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 decision_notes text not null default '',
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(company_id,user_id)
);
create table if not exists public.inv_portal_links(
 company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id),
 investor_id uuid not null references public.inv_investors(id),
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id),
 primary key(company_id,user_id),
 unique(company_id,investor_id)
);
create table if not exists public.inv_portal_withdrawals(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 investor_id uuid not null references public.inv_investors(id),
 investment_id uuid not null references public.inv_investments(id),
 payment_type text not null check(payment_type in ('YIELD','CAPITAL_RETURN')),
 amount numeric(14,2) not null check(amount>0),
 payment_method text not null check(length(trim(payment_method)) between 3 and 80),
 notes text not null default '' check(length(notes)<=1000),
 status text not null default 'PENDING' check(status in ('PENDING','REVIEW','APPROVED','REJECTED','COMPLETED')),
 decision_notes text not null default '',
 payment_id uuid unique references public.inv_payments(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists inv_portal_enrollments_company_status_idx on public.inv_portal_enrollments(company_id,status,created_at desc);
create index if not exists inv_portal_withdrawals_company_status_idx on public.inv_portal_withdrawals(company_id,status,created_at desc);
create index if not exists inv_portal_withdrawals_investor_idx on public.inv_portal_withdrawals(investor_id,created_at desc);
alter table public.inv_portal_enrollments enable row level security;
alter table public.inv_portal_links enable row level security;
alter table public.inv_portal_withdrawals enable row level security;
revoke all on public.inv_portal_enrollments,public.inv_portal_links,public.inv_portal_withdrawals from anon;
grant select on public.inv_portal_enrollments,public.inv_portal_links,public.inv_portal_withdrawals to authenticated;
grant insert on public.inv_portal_enrollments to authenticated;

-- Validate eligibility without granting investors direct access to private SaaS membership tables.
create function public.inv_portal_company_available(p_company uuid)
returns boolean language sql stable security definer set search_path=''
as $
 select exists (
  select 1 from public.saas_company_subscriptions s
  join public.saas_verticals v on v.id=s.vertical_id
  where s.company_id=p_company and v.code='FINANCIAL_INVESTORS'
  and (s.status in ('active','trial') or
       (s.status='past_due' and s.grace_ends_at>now()))
 );
$;
revoke all on function public.inv_portal_company_available(uuid) from public,anon;
grant execute on function public.inv_portal_company_available(uuid) to authenticated;

-- Readable to registered user (self) or the authorized ERP owner/admin for that company.
create policy inv_portal_enrollment_select on public.inv_portal_enrollments
for select to authenticated using (
 user_id=(select auth.uid()) or public.inv_company_can_review(company_id)
);
create policy inv_portal_enrollment_insert on public.inv_portal_enrollments
for insert to authenticated with check (
 user_id=(select auth.uid()) and status='PENDING' and reviewed_by is null
 and reviewed_at is null and decision_notes=''
 and lower(email)=lower(coalesce((select auth.jwt()->>'email'),''))
 and public.inv_portal_company_available(company_id)
);
create policy inv_portal_links_select on public.inv_portal_links
for select to authenticated using (
 user_id=(select auth.uid()) or public.inv_company_can_review(company_id)
);
create policy inv_portal_withdrawals_select on public.inv_portal_withdrawals
for select to authenticated using (
 public.inv_company_can_review(company_id)
 or exists (
   select 1 from public.inv_portal_links l
   join public.inv_portal_enrollments e on e.company_id=l.company_id and e.user_id=l.user_id and e.status='APPROVED'
   where l.company_id=inv_portal_withdrawals.company_id
   and l.investor_id=inv_portal_withdrawals.investor_id
   and l.user_id=(select auth.uid())
 )
);
-- Financial insert/update/delete are not granted directly to investor accounts.
-- All transitions must go through security-definer RPCs in next migration.
