create table if not exists public.dte_runtime_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  environment text not null default 'test' check (environment in ('test','production')),
  production_enabled boolean not null default false,
  production_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.dte_runtime_settings enable row level security;

drop policy if exists dte_runtime_settings_member_read on public.dte_runtime_settings;
create policy dte_runtime_settings_member_read on public.dte_runtime_settings
for select to authenticated using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = dte_runtime_settings.company_id
      and cm.user_id = auth.uid()
  )
);

comment on table public.dte_runtime_settings is 'Runtime DTE switches managed from ERP. Secrets remain server-side environment variables.';
