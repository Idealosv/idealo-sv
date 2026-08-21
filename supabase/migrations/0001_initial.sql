-- IDEALO SV: esquema inicial nuevo
create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.company_role as enum ('owner', 'admin', 'staff', 'viewer');

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.company_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members(user_id);

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create policy "users_read_own_profile"
on public.profiles for select
using (auth.uid() = id);

create policy "users_update_own_profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "members_read_companies"
on public.companies for select
using (
  exists (
    select 1 from public.company_members
    where company_members.company_id = companies.id
      and company_members.user_id = auth.uid()
  )
);

create policy "members_read_memberships"
on public.company_members for select
using (
  exists (
    select 1 from public.company_members as current_membership
    where current_membership.company_id = company_members.company_id
      and current_membership.user_id = auth.uid()
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
