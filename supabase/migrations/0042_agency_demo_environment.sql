-- IDEALO SV: entornos demo comerciales aislados por empresa
create table if not exists public.saas_company_demo_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  is_demo boolean not null default true,
  demo_expires_at timestamptz,
  block_dte_production boolean not null default true,
  block_external_email boolean not null default true,
  resettable boolean not null default true,
  seed_version integer not null default 1 check (seed_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_company_demo_profiles_expiry_idx
  on public.saas_company_demo_profiles(is_demo, demo_expires_at);

alter table public.saas_company_demo_profiles enable row level security;

create policy "members_read_company_demo_profile"
on public.saas_company_demo_profiles for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = saas_company_demo_profiles.company_id
      and cm.user_id = auth.uid()
  )
);

grant select on public.saas_company_demo_profiles to authenticated;
grant all privileges on public.saas_company_demo_profiles to service_role;
