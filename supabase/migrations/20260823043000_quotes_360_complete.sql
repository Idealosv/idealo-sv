-- IDEALO SV · Cotizaciones 360
-- Extensión aditiva del flujo comercial: Cliente -> Cotización -> Aprobación -> Orden -> Producción -> Entrega -> DTE -> Cobro.

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes
  add column if not exists prefix text not null default 'COT',
  add column if not exists code text,
  add column if not exists revision integer not null default 1,
  add column if not exists title text,
  add column if not exists reference text,
  add column if not exists project_name text,
  add column if not exists branch_name text,
  add column if not exists sales_channel text,
  add column if not exists source text,
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists seller_user_id uuid references auth.users(id) on delete set null,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists delivery_address text,
  add column if not exists payment_terms text,
  add column if not exists payment_method text,
  add column if not exists credit_days integer not null default 0,
  add column if not exists deposit_percent numeric(7,2) not null default 0,
  add column if not exists deposit_amount numeric(12,2) not null default 0,
  add column if not exists balance_amount numeric(12,2) not null default 0,
  add column if not exists discount_percent numeric(7,2) not null default 0,
  add column if not exists discount_fixed numeric(12,2) not null default 0,
  add column if not exists surcharge_percent numeric(7,2) not null default 0,
  add column if not exists surcharge_fixed numeric(12,2) not null default 0,
  add column if not exists tax_total numeric(12,2) not null default 0,
  add column if not exists cost_total numeric(12,2) not null default 0,
  add column if not exists profit_total numeric(12,2) not null default 0,
  add column if not exists margin_percent numeric(9,2) not null default 0,
  add column if not exists markup_percent numeric(9,2) not null default 0,
  add column if not exists minimum_margin numeric(9,2) not null default 0,
  add column if not exists close_probability numeric(5,4),
  add column if not exists expected_close_date date,
  add column if not exists requested_delivery_date date,
  add column if not exists promised_delivery_date date,
  add column if not exists installation_required boolean not null default false,
  add column if not exists installation_address text,
  add column if not exists internal_notes text,
  add column if not exists customer_notes text,
  add column if not exists terms_and_conditions text,
  add column if not exists warranty_text text,
  add column if not exists exclusions text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists sent_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists converted_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_owner uuid references auth.users(id) on delete set null,
  add column if not exists public_token uuid default gen_random_uuid(),
  add column if not exists public_link_expires_at timestamptz,
  add column if not exists customer_signature text,
  add column if not exists customer_signature_at timestamptz,
  add column if not exists approval_name text,
  add column if not exists approval_email text,
  add column if not exists approval_phone text,
  add column if not exists soft_deleted_at timestamptz;

alter table public.quotes
  add constraint quotes_status_check check (status in ('DRAFT','PREPARED','SENT','VIEWED','NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','PARTIALLY_CONVERTED','CONVERTED','CANCELLED','ARCHIVED')) not valid;
alter table public.quotes validate constraint quotes_status_check;

alter table public.quote_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists width numeric(12,4),
  add column if not exists height numeric(12,4),
  add column if not exists dimension_unit text not null default 'm',
  add column if not exists area_m2 numeric(14,4) not null default 0,
  add column if not exists price_per_m2 numeric(12,2) not null default 0,
  add column if not exists minimum_price numeric(12,2) not null default 0,
  add column if not exists discount_percent numeric(7,2) not null default 0,
  add column if not exists discount_fixed numeric(12,2) not null default 0,
  add column if not exists surcharge_percent numeric(7,2) not null default 0,
  add column if not exists surcharge_fixed numeric(12,2) not null default 0,
  add column if not exists taxable boolean not null default true,
  add column if not exists tax_rate numeric(7,2) not null default 13,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists unit_cost numeric(12,4) not null default 0,
  add column if not exists labor_unit_cost numeric(12,4) not null default 0,
  add column if not exists installation_unit_cost numeric(12,4) not null default 0,
  add column if not exists cost_total numeric(12,2) not null default 0,
  add column if not exists profit_total numeric(12,2) not null default 0,
  add column if not exists margin_percent numeric(9,2) not null default 0,
  add column if not exists markup_percent numeric(9,2) not null default 0,
  add column if not exists design_included boolean not null default false,
  add column if not exists installation_included boolean not null default false,
  add column if not exists requires_production boolean not null default true,
  add column if not exists estimated_minutes integer,
  add column if not exists lead_time_days integer,
  add column if not exists image_url text,
  add column if not exists specifications text,
  add column if not exists internal_notes text,
  add column if not exists group_name text,
  add column if not exists converted_quantity numeric(12,2) not null default 0;

create index if not exists quotes_company_status_created_idx on public.quotes(company_id, status, created_at desc);
create index if not exists quotes_company_client_created_idx on public.quotes(company_id, client_id, created_at desc);
create index if not exists quotes_company_valid_until_idx on public.quotes(company_id, valid_until) where valid_until is not null;
create index if not exists quotes_follow_up_idx on public.quotes(company_id, follow_up_at) where follow_up_at is not null;
create unique index if not exists quotes_company_code_unique on public.quotes(company_id, code) where code is not null and code <> '';
create unique index if not exists quotes_public_token_unique on public.quotes(public_token) where public_token is not null;
create index if not exists quote_items_quote_sort_idx on public.quote_items(quote_id, sort_order);
create index if not exists quote_items_product_idx on public.quote_items(product_id) where product_id is not null;

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(quote_id, revision)
);

create table if not exists public.quote_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  from_status text,
  to_status text not null,
  comment text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.quote_communications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  channel text not null default 'INTERNAL',
  direction text not null default 'OUTBOUND',
  recipient text,
  subject text,
  message text,
  status text not null default 'RECORDED',
  sent_at timestamptz,
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  approval_type text not null default 'CUSTOMER',
  status text not null default 'PENDING',
  approver_name text,
  approver_email text,
  approver_phone text,
  comments text,
  signature_data text,
  decision_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  due_at timestamptz not null,
  type text not null default 'FOLLOW_UP',
  status text not null default 'PENDING',
  owner_user_id uuid references auth.users(id) on delete set null,
  note text,
  completed_at timestamptz,
  result text,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_type text,
  category text not null default 'OTHER',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  sequence integer not null default 1,
  concept text not null,
  percentage numeric(7,2),
  amount numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'PLANNED',
  created_at timestamptz not null default now()
);

create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  settings jsonb not null default '{}'::jsonb,
  default_terms text,
  default_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_versions_quote_idx on public.quote_versions(quote_id, revision desc);
create index if not exists quote_history_quote_idx on public.quote_status_history(quote_id, changed_at desc);
create index if not exists quote_comms_quote_idx on public.quote_communications(quote_id, created_at desc);
create index if not exists quote_approvals_quote_idx on public.quote_approvals(quote_id, created_at desc);
create index if not exists quote_followups_company_due_idx on public.quote_followups(company_id, status, due_at);
create index if not exists quote_attachments_quote_idx on public.quote_attachments(quote_id, created_at desc);
create index if not exists quote_payment_schedule_quote_idx on public.quote_payment_schedule(quote_id, sequence);
create index if not exists quote_templates_company_idx on public.quote_templates(company_id, active, name);

alter table public.quote_versions enable row level security;
alter table public.quote_status_history enable row level security;
alter table public.quote_communications enable row level security;
alter table public.quote_approvals enable row level security;
alter table public.quote_followups enable row level security;
alter table public.quote_attachments enable row level security;
alter table public.quote_payment_schedule enable row level security;
alter table public.quote_templates enable row level security;

-- Recreate main quote policy using initplan-safe auth.uid() access.
drop policy if exists "members manage quotes" on public.quotes;
create policy "members manage quotes" on public.quotes for all to authenticated
using (exists(select 1 from public.company_members cm where cm.company_id=quotes.company_id and cm.user_id=(select auth.uid())))
with check (exists(select 1 from public.company_members cm where cm.company_id=quotes.company_id and cm.user_id=(select auth.uid())));

drop policy if exists "members manage quote items" on public.quote_items;
create policy "members manage quote items" on public.quote_items for all to authenticated
using (exists(select 1 from public.quotes q join public.company_members cm on cm.company_id=q.company_id where q.id=quote_items.quote_id and cm.user_id=(select auth.uid())))
with check (exists(select 1 from public.quotes q join public.company_members cm on cm.company_id=q.company_id where q.id=quote_items.quote_id and cm.user_id=(select auth.uid())));

create or replace function public.quote_company_member(target_company uuid)
returns boolean language sql stable security invoker set search_path=public as $$
  select exists(select 1 from public.company_members cm where cm.company_id=target_company and cm.user_id=(select auth.uid()));
$$;
revoke all on function public.quote_company_member(uuid) from public, anon;
grant execute on function public.quote_company_member(uuid) to authenticated;

create policy quote_versions_company_access on public.quote_versions for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_history_company_access on public.quote_status_history for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_comms_company_access on public.quote_communications for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_approvals_company_access on public.quote_approvals for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_followups_company_access on public.quote_followups for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_attachments_company_access on public.quote_attachments for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_payment_schedule_company_access on public.quote_payment_schedule for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));
create policy quote_templates_company_access on public.quote_templates for all to authenticated using (public.quote_company_member(company_id)) with check (public.quote_company_member(company_id));

grant select, insert, update, delete on public.quote_versions, public.quote_status_history, public.quote_communications, public.quote_approvals, public.quote_followups, public.quote_attachments, public.quote_payment_schedule, public.quote_templates to authenticated;

create or replace function public.idealo_quote_touch_updated_at()
returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
revoke all on function public.idealo_quote_touch_updated_at() from public, anon;
grant execute on function public.idealo_quote_touch_updated_at() to authenticated;

drop trigger if exists trg_quote_template_touch on public.quote_templates;
create trigger trg_quote_template_touch before update on public.quote_templates for each row execute function public.idealo_quote_touch_updated_at();

-- Generate missing codes for existing rows while preserving existing identity numbers.
update public.quotes set code = prefix || '-' || extract(year from created_at)::int || '-' || lpad(number::text,5,'0') where code is null and number is not null;
update public.quotes set balance_amount = greatest(total - deposit_amount,0) where balance_amount=0 and total>0;
