-- PRESTADITO$ / IDEALO SV
-- Base segura para porcentajes informados (10%, 12%, 15%), contratos y ejecución de renovaciones.
-- No se asume periodicidad, monto mínimo, relación plazo/tasa ni interés simple/compuesto.

alter table public.inv_investments
  add column if not exists return_rate_basis text not null default 'PENDING_DEFINITION';

update public.inv_investments
set return_rate_basis='PENDING_DEFINITION'
where coalesce(trim(return_rate_basis),'')='';

create or replace function public.inv_rate_allowed(p_rate numeric)
returns boolean
language sql
immutable
as $$
  select p_rate in (10,12,15)
$$;

revoke all on function public.inv_rate_allowed(numeric) from public;
grant execute on function public.inv_rate_allowed(numeric) to authenticated,service_role;

create or replace function public.inv_formalize_application_with_rate(
  p_application_id uuid,
  p_granted_at date,
  p_return_rate numeric,
  p_contract_number text default '',
  p_projected_gain numeric default null,
  p_payment_place text default '',
  p_payment_method text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_result public.inv_investments%rowtype;
begin
  if not public.inv_rate_allowed(p_return_rate) then
    raise exception 'El porcentaje debe ser 10%%, 12%% o 15%%.';
  end if;

  select * into v_result
  from public.inv_formalize_application(
    p_application_id,
    p_granted_at,
    p_contract_number,
    p_projected_gain,
    p_payment_place,
    p_payment_method
  );

  update public.inv_investments
  set
    agreed_return_rate=p_return_rate,
    return_rate_basis='PENDING_DEFINITION',
    updated_at=now()
  where id=v_result.id
  returning * into v_result;

  insert into public.inv_audit_log(
    company_id,investor_id,investment_id,action,detail,created_by
  )
  values(
    v_result.company_id,v_result.investor_id,v_result.id,'INVESTMENT_RETURN_RATE_ASSIGNED',
    jsonb_build_object(
      'return_rate_percent',p_return_rate,
      'rate_basis','PENDING_DEFINITION',
      'note','Porcentaje informado por Prestadito$. Periodicidad y fórmula aún no definidas.'
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

create or replace function public.inv_set_investment_return_rate(
  p_investment_id uuid,
  p_return_rate numeric,
  p_note text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_row public.inv_investments%rowtype;
  v_old numeric;
begin
  select * into v_row
  from public.inv_investments
  where id=p_investment_id
  for update;

  if not found then
    raise exception 'Inversión no encontrada.';
  end if;

  if not public.inv_company_can_review(v_row.company_id) then
    raise exception 'Solo propietario o administrador puede cambiar el porcentaje acordado.';
  end if;

  if not public.inv_rate_allowed(p_return_rate) then
    raise exception 'El porcentaje debe ser 10%%, 12%% o 15%%.';
  end if;

  v_old:=v_row.agreed_return_rate;

  update public.inv_investments
  set
    agreed_return_rate=p_return_rate,
    return_rate_basis='PENDING_DEFINITION',
    updated_at=now()
  where id=p_investment_id
  returning * into v_row;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_row.company_id,v_row.investor_id,v_row.id,'INVESTMENT_RETURN_RATE_UPDATED',
    jsonb_build_object(
      'from',v_old,
      'to',p_return_rate,
      'rate_basis','PENDING_DEFINITION',
      'note',coalesce(trim(p_note),'')
    ),
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.inv_formalize_application_with_rate(uuid,date,numeric,text,numeric,text,text) from public;
revoke all on function public.inv_set_investment_return_rate(uuid,numeric,text) from public;
grant execute on function public.inv_formalize_application_with_rate(uuid,date,numeric,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.inv_set_investment_return_rate(uuid,numeric,text) to authenticated,service_role;

create table if not exists public.inv_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  investment_id uuid not null references public.inv_investments(id) on delete cascade,
  contract_code text not null,
  contract_number text not null default '',
  return_rate_percent numeric(9,4) not null,
  rate_basis text not null default 'PENDING_DEFINITION',
  status text not null default 'GENERATED' check(status in ('GENERATED','SIGNED','VOID')),
  snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid default auth.uid(),
  generated_at timestamptz not null default now(),
  signed_by uuid,
  signed_at timestamptz,
  signature_method text not null default '',
  signed_document_id uuid references public.inv_documents(id) on delete set null,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,contract_code),
  unique(investment_id)
);

create index if not exists inv_contracts_company_status_idx
  on public.inv_contracts(company_id,status,generated_at desc);

drop trigger if exists trg_inv_contracts_updated_at on public.inv_contracts;
create trigger trg_inv_contracts_updated_at
before update on public.inv_contracts
for each row execute function public.inv_set_updated_at();

alter table public.inv_contracts enable row level security;

drop policy if exists inv_contracts_select on public.inv_contracts;
create policy inv_contracts_select on public.inv_contracts
for select to authenticated
using(public.inv_company_member(company_id));

create or replace function public.inv_prepare_contract(
  p_investment_id uuid,
  p_return_rate numeric,
  p_contract_number text default ''
)
returns public.inv_contracts
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_investment public.inv_investments%rowtype;
  v_investor public.inv_investors%rowtype;
  v_id uuid;
  v_code text;
  v_snapshot jsonb;
  v_result public.inv_contracts%rowtype;
begin
  select * into v_investment
  from public.inv_investments
  where id=p_investment_id
  for update;

  if not found then
    raise exception 'Inversión no encontrada.';
  end if;

  if not public.inv_company_can_review(v_investment.company_id) then
    raise exception 'Solo propietario o administrador puede preparar contratos.';
  end if;

  if not public.inv_rate_allowed(p_return_rate) then
    raise exception 'El porcentaje debe ser 10%%, 12%% o 15%%.';
  end if;

  select * into v_investor
  from public.inv_investors
  where id=v_investment.investor_id;

  if exists(
    select 1 from public.inv_contracts
    where investment_id=v_investment.id and status='SIGNED'
  ) then
    raise exception 'El contrato ya está marcado como firmado y no puede regenerarse.';
  end if;

  v_snapshot:=jsonb_build_object(
    'investor_code',v_investor.investor_code,
    'investor_name',trim(v_investor.first_names||' '||v_investor.last_names),
    'dui',v_investor.dui,
    'address',v_investor.address,
    'investment_code',v_investment.investment_code,
    'principal',v_investment.principal,
    'granted_at',v_investment.granted_at,
    'term_months',v_investment.term_months,
    'maturity_date',v_investment.maturity_date,
    'return_rate_percent',p_return_rate,
    'rate_basis','PENDING_DEFINITION',
    'payment_place',v_investment.payment_place,
    'payment_method',v_investment.payment_method
  );

  update public.inv_investments
  set
    agreed_return_rate=p_return_rate,
    return_rate_basis='PENDING_DEFINITION',
    contract_number=coalesce(nullif(trim(p_contract_number),''),contract_number),
    updated_at=now()
  where id=v_investment.id;

  select * into v_result
  from public.inv_contracts
  where investment_id=v_investment.id
  for update;

  if found then
    update public.inv_contracts
    set
      contract_number=coalesce(trim(p_contract_number),''),
      return_rate_percent=p_return_rate,
      rate_basis='PENDING_DEFINITION',
      snapshot=v_snapshot,
      status='GENERATED',
      generated_by=auth.uid(),
      generated_at=now(),
      updated_at=now()
    where id=v_result.id
    returning * into v_result;
  else
    v_id:=gen_random_uuid();
    v_code:='CTR-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

    insert into public.inv_contracts(
      id,company_id,investor_id,investment_id,contract_code,contract_number,
      return_rate_percent,rate_basis,status,snapshot,generated_by
    )
    values(
      v_id,v_investment.company_id,v_investment.investor_id,v_investment.id,v_code,
      coalesce(trim(p_contract_number),''),p_return_rate,'PENDING_DEFINITION',
      'GENERATED',v_snapshot,auth.uid()
    )
    returning * into v_result;
  end if;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_result.company_id,v_result.investor_id,v_result.investment_id,'CONTRACT_PREPARED',
    jsonb_build_object(
      'contract_id',v_result.id,
      'contract_code',v_result.contract_code,
      'contract_number',v_result.contract_number,
      'return_rate_percent',v_result.return_rate_percent,
      'rate_basis',v_result.rate_basis
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

create or replace function public.inv_mark_contract_signed(
  p_contract_id uuid,
  p_document_id uuid,
  p_signature_method text default 'SIGNED_DOCUMENT_UPLOAD'
)
returns public.inv_contracts
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_contract public.inv_contracts%rowtype;
  v_document public.inv_documents%rowtype;
begin
  select * into v_contract
  from public.inv_contracts
  where id=p_contract_id
  for update;

  if not found then
    raise exception 'Contrato no encontrado.';
  end if;

  if not public.inv_company_can_review(v_contract.company_id) then
    raise exception 'Solo propietario o administrador puede registrar una firma.';
  end if;

  select * into v_document
  from public.inv_documents
  where id=p_document_id
    and company_id=v_contract.company_id
    and investor_id=v_contract.investor_id
    and investment_id=v_contract.investment_id
    and status='ACTIVE';

  if not found then
    raise exception 'El documento firmado no pertenece a este contrato.';
  end if;

  update public.inv_contracts
  set
    status='SIGNED',
    signed_by=auth.uid(),
    signed_at=now(),
    signature_method=coalesce(nullif(trim(p_signature_method),''),'SIGNED_DOCUMENT_UPLOAD'),
    signed_document_id=v_document.id,
    updated_at=now()
  where id=p_contract_id
  returning * into v_contract;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_contract.company_id,v_contract.investor_id,v_contract.investment_id,'CONTRACT_SIGNED_RECORDED',
    jsonb_build_object(
      'contract_id',v_contract.id,
      'contract_code',v_contract.contract_code,
      'document_id',v_document.id,
      'signature_method',v_contract.signature_method
    ),
    auth.uid()
  );

  return v_contract;
end;
$$;

revoke all on function public.inv_prepare_contract(uuid,numeric,text) from public;
revoke all on function public.inv_mark_contract_signed(uuid,uuid,text) from public;
grant execute on function public.inv_prepare_contract(uuid,numeric,text) to authenticated,service_role;
grant execute on function public.inv_mark_contract_signed(uuid,uuid,text) to authenticated,service_role;
grant select on public.inv_contracts to authenticated;
grant all privileges on public.inv_contracts to service_role;
revoke insert,update,delete on public.inv_contracts from authenticated;

alter table public.inv_renewal_decisions
  add column if not exists executed_return_rate numeric(9,4);

create or replace function public.inv_execute_renewal(
  p_renewal_id uuid,
  p_return_rate numeric,
  p_contract_number text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_decision public.inv_renewal_decisions%rowtype;
  v_old public.inv_investments%rowtype;
  v_new public.inv_investments%rowtype;
  v_id uuid;
  v_code text;
  v_start date;
  v_maturity date;
begin
  select * into v_decision
  from public.inv_renewal_decisions
  where id=p_renewal_id
  for update;

  if not found then
    raise exception 'Decisión de renovación no encontrada.';
  end if;

  if not public.inv_company_can_review(v_decision.company_id) then
    raise exception 'Solo propietario o administrador puede ejecutar renovaciones.';
  end if;

  if v_decision.status<>'RECORDED' then
    raise exception 'La decisión ya no está disponible para ejecución.';
  end if;

  if v_decision.decision_type='WITHDRAW' then
    raise exception 'Las decisiones de retiro se finalizan cuando el capital haya sido devuelto.';
  end if;

  if current_date<(select maturity_date from public.inv_investments where id=v_decision.investment_id) then
    raise exception 'La renovación solo puede ejecutarse en la fecha de vencimiento o después.';
  end if;

  if coalesce(v_decision.renewal_amount,0)<=0 or coalesce(v_decision.renewal_term_months,0)<=0 then
    raise exception 'La decisión no tiene monto o plazo de renovación válidos.';
  end if;

  if not public.inv_rate_allowed(p_return_rate) then
    raise exception 'El porcentaje debe ser 10%%, 12%% o 15%%.';
  end if;

  select * into v_old
  from public.inv_investments
  where id=v_decision.investment_id
  for update;

  if v_old.status in ('RENEWED','CLOSED','CANCELLED') then
    raise exception 'La inversión anterior ya fue cerrada o renovada.';
  end if;

  v_start:=coalesce(v_decision.requested_start_date,current_date);
  if v_start<current_date then
    v_start:=current_date;
  end if;
  v_maturity:=(v_start+make_interval(months=>v_decision.renewal_term_months))::date;
  v_id:=gen_random_uuid();
  v_code:='INVEST-'||to_char(v_start,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

  insert into public.inv_investments(
    id,company_id,investor_id,application_id,investment_code,contract_number,
    principal,granted_at,term_months,maturity_date,agreed_return_rate,
    return_rate_basis,projected_gain,payment_place,payment_method,status,created_by
  )
  values(
    v_id,v_old.company_id,v_old.investor_id,null,v_code,coalesce(trim(p_contract_number),''),
    v_decision.renewal_amount,v_start,v_decision.renewal_term_months,v_maturity,p_return_rate,
    'PENDING_DEFINITION',null,v_decision.payment_place,v_decision.payment_method,'ACTIVE',auth.uid()
  )
  returning * into v_new;

  update public.inv_investments
  set status='RENEWED',updated_at=now()
  where id=v_old.id;

  update public.inv_renewal_decisions
  set
    status='EXECUTED',
    executed_at=now(),
    successor_investment_id=v_new.id,
    executed_return_rate=p_return_rate,
    updated_at=now()
  where id=v_decision.id;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_old.company_id,v_old.investor_id,v_old.id,'RENEWAL_EXECUTED',
    jsonb_build_object(
      'renewal_id',v_decision.id,
      'renewal_code',v_decision.renewal_code,
      'successor_investment_id',v_new.id,
      'successor_investment_code',v_new.investment_code,
      'renewal_amount',v_new.principal,
      'renewal_term_months',v_new.term_months,
      'return_rate_percent',p_return_rate,
      'rate_basis','PENDING_DEFINITION'
    ),
    auth.uid()
  );

  return v_new;
end;
$$;

create or replace function public.inv_finalize_withdrawal(
  p_renewal_id uuid,
  p_confirm_yield_settled boolean,
  p_note text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_decision public.inv_renewal_decisions%rowtype;
  v_investment public.inv_investments%rowtype;
  v_capital_returned numeric;
begin
  select * into v_decision
  from public.inv_renewal_decisions
  where id=p_renewal_id
  for update;

  if not found then
    raise exception 'Decisión de retiro no encontrada.';
  end if;

  if not public.inv_company_can_review(v_decision.company_id) then
    raise exception 'Solo propietario o administrador puede finalizar un retiro.';
  end if;

  if v_decision.status<>'RECORDED' or v_decision.decision_type<>'WITHDRAW' then
    raise exception 'La decisión no corresponde a un retiro pendiente.';
  end if;

  if not coalesce(p_confirm_yield_settled,false) then
    raise exception 'Confirmá manualmente que el rendimiento fue liquidado o que no aplica.';
  end if;

  select * into v_investment
  from public.inv_investments
  where id=v_decision.investment_id
  for update;

  select coalesce(sum(amount),0)
    into v_capital_returned
  from public.inv_payments
  where investment_id=v_investment.id
    and payment_type='CAPITAL_RETURN'
    and status='POSTED';

  if v_capital_returned<v_investment.principal then
    raise exception 'Todavía falta devolver capital antes de cerrar la inversión.';
  end if;

  update public.inv_investments
  set status='CLOSED',updated_at=now()
  where id=v_investment.id
  returning * into v_investment;

  update public.inv_renewal_decisions
  set status='EXECUTED',executed_at=now(),updated_at=now()
  where id=v_decision.id;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_investment.company_id,v_investment.investor_id,v_investment.id,'WITHDRAWAL_FINALIZED',
    jsonb_build_object(
      'renewal_id',v_decision.id,
      'renewal_code',v_decision.renewal_code,
      'capital_returned',v_capital_returned,
      'yield_settlement_confirmed',true,
      'note',coalesce(trim(p_note),'')
    ),
    auth.uid()
  );

  return v_investment;
end;
$$;

revoke all on function public.inv_execute_renewal(uuid,numeric,text) from public;
revoke all on function public.inv_finalize_withdrawal(uuid,boolean,text) from public;
grant execute on function public.inv_execute_renewal(uuid,numeric,text) to authenticated,service_role;
grant execute on function public.inv_finalize_withdrawal(uuid,boolean,text) to authenticated,service_role;
