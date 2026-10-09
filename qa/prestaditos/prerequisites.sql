-- LOCAL QA ONLY: schemas auth + storage are created by the actual Supabase CLI.
-- No production identifiers, no live investor or company information.
create extension if not exists pgcrypto;
create table public.companies(
 id uuid primary key, name text not null
);
create table public.company_members(
 company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id),
 role text not null,
 primary key(company_id,user_id)
);
alter table public.company_members enable row level security;
grant select on public.company_members to authenticated;
create policy prestaditos_qa_member_self on public.company_members
 for select to authenticated using (user_id=auth.uid());
create table public.saas_verticals (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,name text not null,
 description text not null default '',active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.saas_modules(
 id uuid primary key default gen_random_uuid(),code text not null unique,
 name text not null, description text not null default '',
 is_core boolean default false, active boolean default true
);
create table public.saas_vertical_modules (
 vertical_id uuid references public.saas_verticals(id),
 module_id uuid references public.saas_modules(id),
 enabled_by_default boolean,
 primary key(vertical_id,module_id)
);
create table public.saas_plans (
 id uuid primary key default gen_random_uuid(), name text, active boolean default true
);
create table public.saas_plan_modules (
 plan_id uuid references public.saas_plans(id),
 module_id uuid references public.saas_modules(id),
 enabled boolean,primary key(plan_id,module_id)
);
create table public.saas_company_subscriptions (
 company_id uuid primary key references public.companies(id),
 vertical_id uuid references public.saas_verticals(id),
 plan_id uuid references public.saas_plans(id),
 status text, grace_ends_at timestamptz
);
insert into public.companies(id,name) values
 ('11111111-1111-4111-8111-111111111111','PRESTADITOS QA TEST A'),
 ('22222222-2222-4222-8222-222222222222','PRESTADITOS QA TEST B');
insert into public.saas_plans(id,name) values
 ('12341234-1234-4234-8234-123412341234','QA PLAN');
-- Real vertical code is registered by the actual investor ERP migration.
-- Users and memberships are inserted after Auth creates their test accounts.
