-- Internal income control separated from fiscal DTE issuance.
-- This records money received in Caja/Banco but never creates, signs or transmits a DTE.

create table if not exists public.internal_income_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  received_at timestamptz not null default now(),
  concept text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'CASH' check (payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER')),
  reference text,
  notes text,
  fiscal_status text not null default 'NO_DTE_ISSUED' check (fiscal_status in ('NO_DTE_ISSUED','DOCUMENTED_LATER')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists internal_income_records_company_date_idx
  on public.internal_income_records(company_id, received_at desc);

alter table public.internal_income_records enable row level security;

drop policy if exists internal_income_records_company_select on public.internal_income_records;
create policy internal_income_records_company_select on public.internal_income_records
for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=internal_income_records.company_id and cm.user_id=auth.uid()
));

revoke all on public.internal_income_records from public;
grant select on public.internal_income_records to authenticated;

create or replace function public.register_internal_income(
  p_company_id uuid,
  p_cash_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_received_at timestamptz default now(),
  p_payment_method text default 'CASH',
  p_client_id uuid default null,
  p_reference text default null,
  p_notes text default null
) returns public.internal_income_records
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.internal_income_records;
  a public.cash_accounts%rowtype;
  v_method text;
  v_session uuid;
begin
  if not public.erp_can_admin(p_company_id) then
    raise exception 'Solo propietario o administrador puede registrar ingresos internos';
  end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Escribe el concepto del ingreso'; end if;

  select * into a from public.cash_accounts
  where id=p_cash_account_id and company_id=p_company_id and active=true
  for update;
  if not found then raise exception 'Caja o banco no disponible'; end if;

  if p_client_id is not null and not exists(
    select 1 from public.clients where id=p_client_id and company_id=p_company_id
  ) then raise exception 'Cliente no válido para esta empresa'; end if;

  if upper(coalesce(a.account_type,'')) in ('CASH','CAJA','PETTY_CASH') then
    select id into v_session from public.cash_register_sessions
    where company_id=p_company_id and cash_account_id=a.id and status='OPEN'
    order by opened_at desc limit 1;
    if v_session is null then raise exception 'Caja cerrada. Abre la caja antes de registrar el ingreso'; end if;
  end if;

  v_method:=case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER')
    then upper(p_payment_method) else 'OTHER' end;

  insert into public.internal_income_records(
    company_id,client_id,cash_account_id,received_at,concept,amount,payment_method,reference,notes,fiscal_status,created_by
  ) values (
    p_company_id,p_client_id,p_cash_account_id,coalesce(p_received_at,now()),trim(p_concept),round(p_amount,2),v_method,
    nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),'NO_DTE_ISSUED',auth.uid()
  ) returning * into r;

  insert into public.cash_movements(
    company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id
  ) values (
    p_company_id,p_cash_account_id,r.received_at,'INCOME','INTERNAL_INCOME',r.id,
    'Ingreso interno · '||r.concept,r.amount,r.reference,
    coalesce(r.notes,'Registrado internamente sin DTE emitido.'),v_session
  );

  return r;
end;
$$;

revoke all on function public.register_internal_income(uuid,uuid,numeric,text,timestamptz,text,uuid,text,text) from public;
grant execute on function public.register_internal_income(uuid,uuid,numeric,text,timestamptz,text,uuid,text,text) to authenticated;
