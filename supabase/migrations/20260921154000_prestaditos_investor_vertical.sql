-- PRESTADITO$ / IDEALO SV: vertical de gestión de inversionistas
-- ERP multiempresa orientado exclusivamente a inversionistas e inversiones.

insert into public.saas_verticals (code, name, description, active)
values (
  'FINANCIAL_INVESTORS',
  'Financiera · Inversionistas',
  'Gestión de inversionistas, solicitudes, inversiones, beneficiarios, rendimientos, pagos, vencimientos y renovaciones.',
  true
)
on conflict (code) do update
set name=excluded.name, description=excluded.description, active=true, updated_at=now();

insert into public.saas_modules(code,name,description,is_core,active)
values
 ('INVESTORS_CORE','Inversionistas','Expedientes, documentos y beneficiarios de inversionistas.',false,true),
 ('INVESTMENTS_CORE','Inversiones','Solicitudes, aprobaciones, inversiones, vencimientos y renovaciones.',false,true),
 ('INVESTOR_PAYMENTS','Rendimientos y pagos','Pagos, rendimientos y devolución de capital.',false,true)
on conflict(code) do update
set name=excluded.name, description=excluded.description, active=true;

insert into public.saas_vertical_modules(vertical_id,module_id,enabled_by_default)
select v.id,m.id,true
from public.saas_verticals v
join public.saas_modules m on m.code in ('INVESTORS_CORE','INVESTMENTS_CORE','INVESTOR_PAYMENTS')
where v.code='FINANCIAL_INVESTORS'
on conflict(vertical_id,module_id) do update set enabled_by_default=true;

insert into public.saas_plan_modules(plan_id,module_id,enabled)
select p.id,m.id,true
from public.saas_plans p
join public.saas_modules m on m.code in ('INVESTORS_CORE','INVESTMENTS_CORE','INVESTOR_PAYMENTS')
where p.active=true
on conflict(plan_id,module_id) do update set enabled=true;

create or replace function public.inv_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=auth.uid()
  )
$$;

revoke all on function public.inv_company_member(uuid) from public;
grant execute on function public.inv_company_member(uuid) to authenticated, service_role;

create table if not exists public.inv_investors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_code text not null,
  first_names text not null,
  last_names text not null,
  birth_date date,
  dui text not null,
  nit text not null default '',
  marital_status text not null default '',
  profession text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  address text not null default '',
  department text not null default '',
  district text not null default '',
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  bank_name text not null default '',
  bank_account_last4 text not null default '',
  face_photo_path text not null default '',
  dui_front_path text not null default '',
  dui_back_path text not null default '',
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','BLOCKED')),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,dui),
  unique(company_id,investor_code)
);

create table if not exists public.inv_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  full_name text not null,
  dui text not null default '',
  birth_date date,
  relationship text not null default '',
  phone text not null default '',
  address text not null default '',
  percentage numeric(5,2) not null check(percentage>0 and percentage<=100),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inv_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  requested_amount numeric(14,2) not null check(requested_amount>0),
  requested_term_months integer not null check(requested_term_months>0),
  requested_start_date date,
  payment_place text not null default '',
  payment_method text not null default '',
  status text not null default 'PENDING' check(status in ('PENDING','REVIEW','APPROVED','REJECTED','SIGNATURE','FUNDS_RECEIVED','ACTIVE')),
  observations text not null default '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inv_investments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  application_id uuid references public.inv_applications(id) on delete set null,
  investment_code text not null,
  contract_number text not null default '',
  principal numeric(14,2) not null check(principal>0),
  granted_at date not null,
  term_months integer not null check(term_months>0),
  maturity_date date not null,
  agreed_return_rate numeric(9,4),
  return_frequency text not null default '',
  projected_gain numeric(14,2),
  payment_place text not null default '',
  payment_method text not null default '',
  status text not null default 'ACTIVE' check(status in ('PENDING','ACTIVE','MATURING','MATURED','RENEWED','CLOSED','CANCELLED')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,investment_code)
);

create table if not exists public.inv_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  investment_id uuid references public.inv_investments(id) on delete set null,
  payment_type text not null check(payment_type in ('YIELD','CAPITAL_RETURN','ADJUSTMENT')),
  amount numeric(14,2) not null check(amount>0),
  payment_date date not null default current_date,
  payment_place text not null default '',
  payment_method text not null default '',
  reference text not null default '',
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.inv_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid references public.inv_investors(id) on delete set null,
  investment_id uuid references public.inv_investments(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists inv_investors_company_name_idx on public.inv_investors(company_id,last_names,first_names);
create index if not exists inv_applications_company_status_idx on public.inv_applications(company_id,status,created_at desc);
create index if not exists inv_investments_company_status_idx on public.inv_investments(company_id,status,maturity_date);
create index if not exists inv_payments_company_date_idx on public.inv_payments(company_id,payment_date desc);
create index if not exists inv_beneficiaries_investor_idx on public.inv_beneficiaries(investor_id,active);

create or replace function public.inv_guard_beneficiary_percentage()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare v_total numeric;
begin
  select coalesce(sum(percentage),0)
  into v_total
  from public.inv_beneficiaries
  where investor_id=new.investor_id
    and active=true
    and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
  if new.active and v_total+new.percentage>100 then
    raise exception 'El porcentaje total de beneficiarios no puede superar 100%%.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inv_beneficiary_percentage on public.inv_beneficiaries;
create trigger trg_inv_beneficiary_percentage
before insert or update of investor_id,percentage,active on public.inv_beneficiaries
for each row execute function public.inv_guard_beneficiary_percentage();

create or replace function public.inv_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['inv_investors','inv_beneficiaries','inv_applications','inv_investments']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I',t,t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.inv_set_updated_at()',t,t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['inv_investors','inv_beneficiaries','inv_applications','inv_investments','inv_payments','inv_audit_log']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists inv_member_select on public.%I',t);
    execute format('drop policy if exists inv_member_insert on public.%I',t);
    execute format('drop policy if exists inv_member_update on public.%I',t);
    execute format('drop policy if exists inv_member_delete on public.%I',t);
    execute format('create policy inv_member_select on public.%I for select to authenticated using (public.inv_company_member(company_id))',t);
    execute format('create policy inv_member_insert on public.%I for insert to authenticated with check (public.inv_company_member(company_id))',t);
    execute format('create policy inv_member_update on public.%I for update to authenticated using (public.inv_company_member(company_id)) with check (public.inv_company_member(company_id))',t);
    execute format('create policy inv_member_delete on public.%I for delete to authenticated using (public.inv_company_member(company_id))',t);
  end loop;
end $$;

grant select,insert,update,delete on public.inv_investors,public.inv_beneficiaries,public.inv_applications,public.inv_investments,public.inv_payments,public.inv_audit_log to authenticated;
grant all privileges on public.inv_investors,public.inv_beneficiaries,public.inv_applications,public.inv_investments,public.inv_payments,public.inv_audit_log to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('investor-documents','investor-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists investor_documents_select on storage.objects;
drop policy if exists investor_documents_insert on storage.objects;
drop policy if exists investor_documents_update on storage.objects;
drop policy if exists investor_documents_delete on storage.objects;

create policy investor_documents_select on storage.objects
for select to authenticated
using (
  bucket_id='investor-documents'
  and exists(
    select 1 from public.company_members cm
    where cm.company_id::text=split_part(name,'/',1)
      and cm.user_id=auth.uid()
  )
);

create policy investor_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='investor-documents'
  and exists(
    select 1 from public.company_members cm
    where cm.company_id::text=split_part(name,'/',1)
      and cm.user_id=auth.uid()
  )
);

create policy investor_documents_update on storage.objects
for update to authenticated
using (
  bucket_id='investor-documents'
  and exists(
    select 1 from public.company_members cm
    where cm.company_id::text=split_part(name,'/',1)
      and cm.user_id=auth.uid()
  )
)
with check (
  bucket_id='investor-documents'
  and exists(
    select 1 from public.company_members cm
    where cm.company_id::text=split_part(name,'/',1)
      and cm.user_id=auth.uid()
  )
);

create policy investor_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id='investor-documents'
  and exists(
    select 1 from public.company_members cm
    where cm.company_id::text=split_part(name,'/',1)
      and cm.user_id=auth.uid()
  )
);
