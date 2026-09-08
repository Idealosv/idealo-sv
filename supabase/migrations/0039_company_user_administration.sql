create table if not exists public.company_admin_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_admin_audit_company_created_idx
  on public.company_admin_audit(company_id, created_at desc);

alter table public.company_admin_audit enable row level security;

create policy "company_admins_read_admin_audit"
on public.company_admin_audit for select
using (
  exists (
    select 1 from public.company_members m
    where m.company_id = company_admin_audit.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  )
);

grant select on table public.company_admin_audit to authenticated;
grant all privileges on table public.company_admin_audit to service_role;
