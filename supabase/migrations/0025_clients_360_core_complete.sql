-- IDEALO SV · Clientes 360 core completo
alter table public.clients
  add column if not exists client_code text,
  add column if not exists credit_days integer not null default 0,
  add column if not exists blocked_for_debt boolean not null default false,
  add column if not exists delivery_address text,
  add column if not exists installation_address text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

create unique index if not exists uq_client_code_company on public.clients(company_id,client_code) where client_code is not null;

create table if not exists public.client_contacts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade, name text not null, position text, email text, phone text,
 whatsapp text, is_primary boolean not null default false, notes text not null default '', created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.client_addresses (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade, address_type text not null default 'billing' check(address_type in('billing','delivery','installation','other')),
 label text, department text, department_code text, municipality text, municipality_code text, district_code text, address text not null,
 latitude numeric, longitude numeric, is_primary boolean not null default false, created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.client_interactions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade, interaction_type text not null default 'note', channel text, subject text,
 details text not null default '', occurred_at timestamptz not null default now(), next_follow_up_at timestamptz, outcome text,
 created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table if not exists public.client_credit_profiles (
 client_id uuid primary key references public.clients(id) on delete cascade, company_id uuid not null references public.companies(id) on delete cascade,
 credit_enabled boolean not null default false, credit_limit numeric(14,2) not null default 0, credit_days integer not null default 0,
 risk_level text not null default 'normal' check(risk_level in('low','normal','medium','high','blocked')), blocked boolean not null default false,
 blocked_reason text, last_review_at timestamptz, reviewed_by uuid, updated_at timestamptz not null default now()
);
create table if not exists public.client_audit_log (
 id bigserial primary key, company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade, action text not null, field_name text,
 old_value jsonb, new_value jsonb, actor_id uuid default auth.uid(), created_at timestamptz not null default now()
);

create index if not exists idx_client_contacts_company_client on public.client_contacts(company_id,client_id);
create index if not exists idx_client_addresses_company_client on public.client_addresses(company_id,client_id);
create index if not exists idx_client_interactions_company_client on public.client_interactions(company_id,client_id,occurred_at desc);
create index if not exists idx_client_audit_company_client on public.client_audit_log(company_id,client_id,created_at desc);

alter table public.client_contacts enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_interactions enable row level security;
alter table public.client_credit_profiles enable row level security;
alter table public.client_audit_log enable row level security;

do $$ declare t text; begin
 foreach t in array array['client_contacts','client_addresses','client_interactions','client_credit_profiles','client_audit_log'] loop
  execute format('drop policy if exists %I_member_all on public.%I',t,t);
  execute format('create policy %I_member_all on public.%I for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id))',t,t);
 end loop;
end $$;

grant select,insert,update,delete on public.client_contacts,public.client_addresses,public.client_interactions,public.client_credit_profiles to authenticated;
grant select on public.client_audit_log to authenticated;
grant usage,select on sequence public.client_audit_log_id_seq to authenticated;

create or replace function public.client_duplicate_candidates(p_company_id uuid,p_client_id uuid default null)
returns table(client_id uuid,name text,reason text,score integer)
language sql stable security invoker set search_path='' as $$
 with src as(select * from public.clients where company_id=p_company_id and(p_client_id is null or id=p_client_id)),
 cand as(select c.id,c.name,
 concat_ws(', ',case when coalesce(c.tax_id,'')<>'' and c.tax_id=s.tax_id then 'NIT' end,case when coalesce(c.nrc,'')<>'' and c.nrc=s.nrc then 'NRC' end,
 case when lower(trim(coalesce(c.email,'')))<>'' and lower(trim(c.email))=lower(trim(coalesce(s.email,''))) then 'correo' end,
 case when regexp_replace(coalesce(c.phone,''),'\D','','g')<>'' and regexp_replace(coalesce(c.phone,''),'\D','','g')=regexp_replace(coalesce(s.phone,''),'\D','','g') then 'teléfono' end) reason,
 (case when coalesce(c.tax_id,'')<>'' and c.tax_id=s.tax_id then 50 else 0 end+case when coalesce(c.nrc,'')<>'' and c.nrc=s.nrc then 35 else 0 end+
 case when lower(trim(coalesce(c.email,'')))<>'' and lower(trim(c.email))=lower(trim(coalesce(s.email,''))) then 20 else 0 end+
 case when regexp_replace(coalesce(c.phone,''),'\D','','g')<>'' and regexp_replace(coalesce(c.phone,''),'\D','','g')=regexp_replace(coalesce(s.phone,''),'\D','','g') then 15 else 0 end) score
 from src s join public.clients c on c.company_id=s.company_id and c.id<>s.id)
 select id,name,reason,score from cand where score>=20 order by score desc,name;
$$;
grant execute on function public.client_duplicate_candidates(uuid,uuid) to authenticated;

create or replace view public.client_360_summary with(security_invoker=true) as
select c.id,c.company_id,c.name,c.trade_name,c.client_code,c.status,c.preferred_dte_type,c.tax_id,c.nrc,c.dui,c.email,c.phone,c.whatsapp,
 c.credit_limit,c.credit_days,c.blocked_for_debt,
 (select count(*) from public.client_contacts cc where cc.client_id=c.id) contact_count,
 (select count(*) from public.client_addresses ca where ca.client_id=c.id) address_count,
 (select max(ci.occurred_at) from public.client_interactions ci where ci.client_id=c.id) last_interaction_at,
 coalesce((select sum(ar.amount_total-ar.amount_paid) from public.accounts_receivable ar where ar.client_id=c.id and ar.company_id=c.company_id),0) outstanding_balance,
 coalesce((select sum(cp.amount) from public.customer_payments cp where cp.client_id=c.id and cp.company_id=c.company_id),0) total_paid,
 (select count(*) from public.quotes q where q.client_id=c.id and q.company_id=c.company_id) quote_count,
 (select count(*) from public.work_orders wo where wo.client_id=c.id and wo.company_id=c.company_id) work_order_count,
 (select count(*) from public.dte_documents d where d.client_id=c.id and d.company_id=c.company_id) dte_count
from public.clients c;
grant select on public.client_360_summary to authenticated;

create or replace function public.audit_client_changes() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; ov jsonb; nv jsonb;
begin
 if tg_op='UPDATE' then
  for k in select key from jsonb_each(to_jsonb(new)) loop
   ov:=to_jsonb(old)->k; nv:=to_jsonb(new)->k;
   if ov is distinct from nv and k not in('updated_at') then
    insert into public.client_audit_log(company_id,client_id,action,field_name,old_value,new_value,actor_id)
    values(new.company_id,new.id,'UPDATE',k,ov,nv,auth.uid());
   end if;
  end loop;
  return new;
 elsif tg_op='INSERT' then
  insert into public.client_audit_log(company_id,client_id,action,new_value,actor_id) values(new.company_id,new.id,'CREATE',to_jsonb(new),auth.uid());
  return new;
 end if;
 return old;
end $$;
drop trigger if exists trg_clients_360_audit on public.clients;
create trigger trg_clients_360_audit after insert or update on public.clients for each row execute function public.audit_client_changes();
