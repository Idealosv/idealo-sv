-- Prestaditos Inversionistas: independent data, default-deny policies.
create extension if not exists pgcrypto;
create table public.prestaditos_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','analyst'))
);
create table public.prestaditos_investors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  full_name text not null check(length(trim(full_name)) between 3 and 120),
  dui text not null check(length(trim(dui)) between 8 and 20),
  phone text not null,
  email text not null,
  approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
  created_at timestamptz default now() not null
);
create table public.prestaditos_requests (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.prestaditos_investors(id),
  request_type text not null check(request_type in ('contribution','withdrawal')),
  withdrawal_source text check(withdrawal_source in ('capital','yield')),
  amount numeric(14,2) not null check(amount > 0),
  method text not null check(method in ('transfer','deposit','cash')),
  requested_date date,
  proof_path text,
  notes text not null default '' check(length(notes)<=1000),
  status text not null default 'pending' check(status in ('pending','review','approved','rejected','processed')),
  admin_notes text default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint request_source_ok check(
    (request_type='withdrawal' and withdrawal_source is not null and proof_path is null)
    or (request_type='contribution' and withdrawal_source is null)
  )
);
create table public.prestaditos_ledger (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.prestaditos_investors(id),
  request_id uuid unique references public.prestaditos_requests(id),
  movement_type text not null check(movement_type in ('capital_in','capital_out','yield','yield_paid')),
  amount numeric(14,2) not null check(amount > 0),
  notes text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.prestaditos_requests(investor_id,created_at desc);
create index on public.prestaditos_ledger(investor_id,created_at desc);
alter table public.prestaditos_staff enable row level security;
alter table public.prestaditos_investors enable row level security;
alter table public.prestaditos_requests enable row level security;
alter table public.prestaditos_ledger enable row level security;
revoke all on public.prestaditos_staff,public.prestaditos_investors,public.prestaditos_requests,public.prestaditos_ledger from anon;
grant select on public.prestaditos_staff,public.prestaditos_investors,public.prestaditos_requests,public.prestaditos_ledger to authenticated;
grant insert on public.prestaditos_investors,public.prestaditos_requests to authenticated;
create policy staff_self on public.prestaditos_staff for select to authenticated using(user_id=auth.uid());
create policy investor_read on public.prestaditos_investors for select to authenticated using(
  user_id=auth.uid() or exists(select 1 from public.prestaditos_staff where user_id=auth.uid()));
create policy investor_enroll on public.prestaditos_investors for insert to authenticated with check(
  user_id=auth.uid() and approval_status='pending'
  and lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy requests_read on public.prestaditos_requests for select to authenticated using(
  exists(select 1 from public.prestaditos_staff where user_id=auth.uid())
  or exists(select 1 from public.prestaditos_investors where id=investor_id and user_id=auth.uid()));
create policy requests_create on public.prestaditos_requests for insert to authenticated with check(
  status='pending' and reviewed_by is null and reviewed_at is null
  and coalesce(admin_notes,'')=''
  and exists(select 1 from public.prestaditos_investors where id=investor_id and user_id=auth.uid() and approval_status='approved')
  and (proof_path is null or split_part(proof_path,'/',1)=auth.uid()::text));
create policy ledger_read on public.prestaditos_ledger for select to authenticated using(
  exists(select 1 from public.prestaditos_staff where user_id=auth.uid())
  or exists(select 1 from public.prestaditos_investors where id=investor_id and user_id=auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('prestaditos-receipts','prestaditos-receipts',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;
create policy prestaditos_receipt_upload on storage.objects for insert to authenticated with check(
 bucket_id='prestaditos-receipts'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.prestaditos_investors where user_id=auth.uid() and approval_status='approved'));
create policy prestaditos_receipt_read on storage.objects for select to authenticated using(
 bucket_id='prestaditos-receipts'
 and ((storage.foldername(name))[1]=auth.uid()::text
 or exists(select 1 from public.prestaditos_staff where user_id=auth.uid())));
-- Staff bootstrap (after owner email verification):
-- insert into public.prestaditos_staff(user_id,role)
-- select id,'admin' from auth.users where lower(email)=lower('OWNER@EXAMPLE.COM');
