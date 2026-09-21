-- PRESTADITO$ / IDEALO SV
-- Renovaciones: captura de decisión al vencimiento sin ejecutar automáticamente una nueva inversión.

create table if not exists public.inv_renewal_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  investment_id uuid not null references public.inv_investments(id) on delete cascade,
  renewal_code text not null,
  decision_type text not null check(decision_type in ('RENEW_CAPITAL','RENEW_CAPITAL_YIELD','RENEW_CUSTOM','WITHDRAW')),
  renewal_amount numeric(14,2),
  renewal_term_months integer,
  requested_start_date date,
  payment_place text not null default '',
  payment_method text not null default '',
  notes text not null default '',
  status text not null default 'RECORDED' check(status in ('RECORDED','CANCELLED','EXECUTED')),
  decided_by uuid default auth.uid(),
  decided_at timestamptz not null default now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  executed_at timestamptz,
  successor_investment_id uuid references public.inv_investments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,renewal_code)
);

create unique index if not exists inv_renewal_active_decision_uidx
  on public.inv_renewal_decisions(investment_id)
  where status='RECORDED';

create index if not exists inv_renewal_company_status_idx
  on public.inv_renewal_decisions(company_id,status,decided_at desc);

create index if not exists inv_renewal_investor_idx
  on public.inv_renewal_decisions(investor_id,decided_at desc);

drop trigger if exists trg_inv_renewal_decisions_updated_at on public.inv_renewal_decisions;
create trigger trg_inv_renewal_decisions_updated_at
before update on public.inv_renewal_decisions
for each row execute function public.inv_set_updated_at();

alter table public.inv_renewal_decisions enable row level security;

drop policy if exists inv_renewal_decisions_select on public.inv_renewal_decisions;
create policy inv_renewal_decisions_select on public.inv_renewal_decisions
for select to authenticated
using(public.inv_company_member(company_id));

create or replace function public.inv_save_renewal_decision(
  p_investment_id uuid,
  p_decision_type text,
  p_renewal_amount numeric default null,
  p_renewal_term_months integer default null,
  p_requested_start_date date default null,
  p_payment_place text default '',
  p_payment_method text default '',
  p_notes text default ''
)
returns public.inv_renewal_decisions
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_investment public.inv_investments%rowtype;
  v_existing public.inv_renewal_decisions%rowtype;
  v_result public.inv_renewal_decisions%rowtype;
  v_type text;
  v_id uuid;
  v_code text;
  v_days integer;
begin
  select * into v_investment
  from public.inv_investments
  where id=p_investment_id
  for update;

  if not found then
    raise exception 'Inversión no encontrada.';
  end if;

  if not public.inv_company_can_review(v_investment.company_id) then
    raise exception 'Solo propietario o administrador puede registrar decisiones de renovación.';
  end if;

  if v_investment.status in ('CANCELLED','CLOSED','RENEWED') then
    raise exception 'La inversión ya no admite una nueva decisión de vencimiento.';
  end if;

  v_days:=v_investment.maturity_date-current_date;
  if v_days>30 then
    raise exception 'La decisión de renovación solo puede registrarse dentro de los 30 días previos al vencimiento o después de vencer.';
  end if;

  v_type:=upper(trim(coalesce(p_decision_type,'')));
  if v_type not in ('RENEW_CAPITAL','RENEW_CAPITAL_YIELD','RENEW_CUSTOM','WITHDRAW') then
    raise exception 'Tipo de decisión no permitido.';
  end if;

  if v_type<>'WITHDRAW' then
    if coalesce(p_renewal_amount,0)<=0 then
      raise exception 'Indicá el monto que se pretende renovar.';
    end if;
    if coalesce(p_renewal_term_months,0)<=0 then
      raise exception 'Indicá el nuevo plazo de renovación.';
    end if;
  end if;

  select * into v_existing
  from public.inv_renewal_decisions
  where investment_id=v_investment.id
    and status='RECORDED'
  limit 1
  for update;

  if found then
    update public.inv_renewal_decisions
    set
      decision_type=v_type,
      renewal_amount=case when v_type='WITHDRAW' then null else p_renewal_amount end,
      renewal_term_months=case when v_type='WITHDRAW' then null else p_renewal_term_months end,
      requested_start_date=case when v_type='WITHDRAW' then null else p_requested_start_date end,
      payment_place=coalesce(trim(p_payment_place),''),
      payment_method=coalesce(trim(p_payment_method),''),
      notes=coalesce(trim(p_notes),''),
      decided_by=auth.uid(),
      decided_at=now(),
      updated_at=now()
    where id=v_existing.id
    returning * into v_result;

    insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
    values(
      v_investment.company_id,v_investment.investor_id,v_investment.id,'RENEWAL_DECISION_UPDATED',
      jsonb_build_object(
        'renewal_id',v_result.id,
        'renewal_code',v_result.renewal_code,
        'decision_type',v_result.decision_type,
        'renewal_amount',v_result.renewal_amount,
        'renewal_term_months',v_result.renewal_term_months
      ),
      auth.uid()
    );
  else
    v_id:=gen_random_uuid();
    v_code:='REN-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

    insert into public.inv_renewal_decisions(
      id,company_id,investor_id,investment_id,renewal_code,decision_type,
      renewal_amount,renewal_term_months,requested_start_date,payment_place,
      payment_method,notes,status,decided_by
    )
    values(
      v_id,v_investment.company_id,v_investment.investor_id,v_investment.id,v_code,v_type,
      case when v_type='WITHDRAW' then null else p_renewal_amount end,
      case when v_type='WITHDRAW' then null else p_renewal_term_months end,
      case when v_type='WITHDRAW' then null else p_requested_start_date end,
      coalesce(trim(p_payment_place),''),
      coalesce(trim(p_payment_method),''),
      coalesce(trim(p_notes),''),
      'RECORDED',auth.uid()
    )
    returning * into v_result;

    insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
    values(
      v_investment.company_id,v_investment.investor_id,v_investment.id,'RENEWAL_DECISION_RECORDED',
      jsonb_build_object(
        'renewal_id',v_result.id,
        'renewal_code',v_result.renewal_code,
        'decision_type',v_result.decision_type,
        'renewal_amount',v_result.renewal_amount,
        'renewal_term_months',v_result.renewal_term_months
      ),
      auth.uid()
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.inv_cancel_renewal_decision(
  p_renewal_id uuid,
  p_reason text
)
returns public.inv_renewal_decisions
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_row public.inv_renewal_decisions%rowtype;
begin
  select * into v_row
  from public.inv_renewal_decisions
  where id=p_renewal_id
  for update;

  if not found then
    raise exception 'Decisión de renovación no encontrada.';
  end if;

  if not public.inv_company_can_review(v_row.company_id) then
    raise exception 'Solo propietario o administrador puede cancelar una decisión de renovación.';
  end if;

  if v_row.status<>'RECORDED' then
    raise exception 'Solo se puede cancelar una decisión registrada y no ejecutada.';
  end if;

  if coalesce(trim(p_reason),'')='' then
    raise exception 'Indicá el motivo de la cancelación.';
  end if;

  update public.inv_renewal_decisions
  set
    status='CANCELLED',
    cancelled_by=auth.uid(),
    cancelled_at=now(),
    cancel_reason=trim(p_reason),
    updated_at=now()
  where id=p_renewal_id
  returning * into v_row;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_row.company_id,v_row.investor_id,v_row.investment_id,'RENEWAL_DECISION_CANCELLED',
    jsonb_build_object(
      'renewal_id',v_row.id,
      'renewal_code',v_row.renewal_code,
      'reason',v_row.cancel_reason
    ),
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.inv_save_renewal_decision(uuid,text,numeric,integer,date,text,text,text) from public;
revoke all on function public.inv_cancel_renewal_decision(uuid,text) from public;
grant execute on function public.inv_save_renewal_decision(uuid,text,numeric,integer,date,text,text,text) to authenticated,service_role;
grant execute on function public.inv_cancel_renewal_decision(uuid,text) to authenticated,service_role;

grant select on public.inv_renewal_decisions to authenticated;
grant all privileges on public.inv_renewal_decisions to service_role;
revoke insert,update,delete on public.inv_renewal_decisions from authenticated;
