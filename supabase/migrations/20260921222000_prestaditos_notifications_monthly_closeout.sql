-- PRESTADITO$ / IDEALO SV
-- Centro de notificaciones por usuario y cierres mensuales de solo lectura/snapshot.

create table if not exists public.inv_notification_states (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  alert_key text not null,
  state text not null default 'READ' check(state in ('READ','DISMISSED')),
  alert_title text not null default '',
  alert_detail text not null default '',
  alert_type text not null default '',
  priority text not null default '',
  target_tab text not null default '',
  investor_id uuid,
  investment_id uuid,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key(company_id,user_id,alert_key)
);

create index if not exists inv_notification_states_user_idx
  on public.inv_notification_states(user_id,updated_at desc);

alter table public.inv_notification_states enable row level security;

drop policy if exists inv_notification_states_select on public.inv_notification_states;
create policy inv_notification_states_select on public.inv_notification_states
for select to authenticated
using(
  user_id=auth.uid()
  and public.inv_company_member(company_id)
);

create or replace function public.inv_set_notification_state(
  p_company_id uuid,
  p_alert_key text,
  p_state text,
  p_alert_title text default '',
  p_alert_detail text default '',
  p_alert_type text default '',
  p_priority text default '',
  p_target_tab text default '',
  p_investor_id uuid default null,
  p_investment_id uuid default null,
  p_note text default ''
)
returns public.inv_notification_states
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_state text;
  v_result public.inv_notification_states%rowtype;
begin
  if not public.inv_company_member(p_company_id) then
    raise exception 'No tenés acceso a esta empresa.';
  end if;

  if coalesce(trim(p_alert_key),'')='' then
    raise exception 'La alerta es obligatoria.';
  end if;

  v_state:=upper(trim(coalesce(p_state,'')));
  if v_state not in ('READ','DISMISSED') then
    raise exception 'Estado de notificación no permitido.';
  end if;

  insert into public.inv_notification_states(
    company_id,user_id,alert_key,state,alert_title,alert_detail,alert_type,priority,
    target_tab,investor_id,investment_id,note,updated_at
  )
  values(
    p_company_id,auth.uid(),trim(p_alert_key),v_state,
    coalesce(trim(p_alert_title),''),coalesce(trim(p_alert_detail),''),
    coalesce(trim(p_alert_type),''),coalesce(trim(p_priority),''),
    coalesce(trim(p_target_tab),''),p_investor_id,p_investment_id,
    coalesce(trim(p_note),''),now()
  )
  on conflict(company_id,user_id,alert_key) do update set
    state=excluded.state,
    alert_title=excluded.alert_title,
    alert_detail=excluded.alert_detail,
    alert_type=excluded.alert_type,
    priority=excluded.priority,
    target_tab=excluded.target_tab,
    investor_id=excluded.investor_id,
    investment_id=excluded.investment_id,
    note=excluded.note,
    updated_at=now()
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.inv_clear_notification_state(
  p_company_id uuid,
  p_alert_key text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.inv_company_member(p_company_id) then
    raise exception 'No tenés acceso a esta empresa.';
  end if;

  delete from public.inv_notification_states
  where company_id=p_company_id
    and user_id=auth.uid()
    and alert_key=trim(p_alert_key);
end;
$$;

revoke all on function public.inv_set_notification_state(uuid,text,text,text,text,text,text,text,uuid,uuid,text) from public;
revoke all on function public.inv_clear_notification_state(uuid,text) from public;
grant execute on function public.inv_set_notification_state(uuid,text,text,text,text,text,text,text,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.inv_clear_notification_state(uuid,text) to authenticated,service_role;
grant select on public.inv_notification_states to authenticated;
grant all privileges on public.inv_notification_states to service_role;
revoke insert,update,delete on public.inv_notification_states from authenticated;


create table if not exists public.inv_monthly_closeouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  closeout_code text not null,
  period_month date not null,
  version integer not null,
  metrics jsonb not null default '{}'::jsonb,
  notes text not null default '',
  generated_by uuid default auth.uid(),
  generated_at timestamptz not null default now(),
  unique(company_id,closeout_code),
  unique(company_id,period_month,version),
  check(period_month=date_trunc('month',period_month)::date),
  check(version>0)
);

create index if not exists inv_monthly_closeouts_company_period_idx
  on public.inv_monthly_closeouts(company_id,period_month desc,version desc);

alter table public.inv_monthly_closeouts enable row level security;

drop policy if exists inv_monthly_closeouts_select on public.inv_monthly_closeouts;
create policy inv_monthly_closeouts_select on public.inv_monthly_closeouts
for select to authenticated
using(public.inv_company_member(company_id));

create or replace function public.inv_generate_monthly_closeout(
  p_company_id uuid,
  p_period date,
  p_notes text default ''
)
returns public.inv_monthly_closeouts
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_start date;
  v_end date;
  v_version integer;
  v_id uuid;
  v_code text;
  v_new_investments integer;
  v_capital_formalized numeric;
  v_yield_paid numeric;
  v_capital_returned numeric;
  v_adjustments numeric;
  v_payments_count integer;
  v_maturities integer;
  v_renewals_executed integer;
  v_withdrawals_finalized integer;
  v_contracts_signed integer;
  v_result public.inv_monthly_closeouts%rowtype;
begin
  if not public.inv_company_can_review(p_company_id) then
    raise exception 'Solo propietario o administrador puede generar cierres mensuales.';
  end if;

  if p_period is null then
    raise exception 'Indicá el mes del cierre.';
  end if;

  v_start:=date_trunc('month',p_period)::date;
  v_end:=(v_start+interval '1 month')::date;

  if v_start>date_trunc('month',current_date)::date then
    raise exception 'No se puede generar un cierre de un mes futuro.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(principal),0)
  into v_new_investments,v_capital_formalized
  from public.inv_investments
  where company_id=p_company_id
    and granted_at>=v_start
    and granted_at<v_end
    and status<>'CANCELLED';

  select
    coalesce(sum(amount) filter(where payment_type='YIELD'),0),
    coalesce(sum(amount) filter(where payment_type='CAPITAL_RETURN'),0),
    coalesce(sum(amount) filter(where payment_type='ADJUSTMENT'),0),
    count(*)::integer
  into v_yield_paid,v_capital_returned,v_adjustments,v_payments_count
  from public.inv_payments
  where company_id=p_company_id
    and status='POSTED'
    and payment_date>=v_start
    and payment_date<v_end;

  select count(*)::integer into v_maturities
  from public.inv_investments
  where company_id=p_company_id
    and maturity_date>=v_start
    and maturity_date<v_end
    and status<>'CANCELLED';

  select
    count(*) filter(where decision_type<>'WITHDRAW')::integer,
    count(*) filter(where decision_type='WITHDRAW')::integer
  into v_renewals_executed,v_withdrawals_finalized
  from public.inv_renewal_decisions
  where company_id=p_company_id
    and status='EXECUTED'
    and executed_at>=v_start
    and executed_at<v_end;

  select count(*)::integer into v_contracts_signed
  from public.inv_contracts
  where company_id=p_company_id
    and status='SIGNED'
    and signed_at>=v_start
    and signed_at<v_end;

  select coalesce(max(version),0)+1
    into v_version
  from public.inv_monthly_closeouts
  where company_id=p_company_id
    and period_month=v_start;

  v_id:=gen_random_uuid();
  v_code:='CIE-'||to_char(v_start,'YYYYMM')||'-V'||lpad(v_version::text,2,'0');

  insert into public.inv_monthly_closeouts(
    id,company_id,closeout_code,period_month,version,metrics,notes,generated_by
  )
  values(
    v_id,p_company_id,v_code,v_start,v_version,
    jsonb_build_object(
      'period_start',v_start,
      'period_end_exclusive',v_end,
      'new_investments',v_new_investments,
      'capital_formalized',v_capital_formalized,
      'yield_paid',v_yield_paid,
      'capital_returned',v_capital_returned,
      'adjustments',v_adjustments,
      'payments_count',v_payments_count,
      'maturities',v_maturities,
      'renewals_executed',v_renewals_executed,
      'withdrawals_finalized',v_withdrawals_finalized,
      'contracts_signed',v_contracts_signed
    ),
    coalesce(trim(p_notes),''),
    auth.uid()
  )
  returning * into v_result;

  insert into public.inv_audit_log(company_id,action,detail,created_by)
  values(
    p_company_id,'MONTHLY_CLOSEOUT_GENERATED',
    jsonb_build_object(
      'closeout_id',v_result.id,
      'closeout_code',v_result.closeout_code,
      'period_month',v_result.period_month,
      'version',v_result.version,
      'metrics',v_result.metrics
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.inv_generate_monthly_closeout(uuid,date,text) from public;
grant execute on function public.inv_generate_monthly_closeout(uuid,date,text) to authenticated,service_role;
grant select on public.inv_monthly_closeouts to authenticated;
grant all privileges on public.inv_monthly_closeouts to service_role;
revoke insert,update,delete on public.inv_monthly_closeouts from authenticated;

comment on table public.inv_monthly_closeouts is
'Snapshots mensuales de actividad. No bloquean ni alteran inversiones, pagos, contratos o renovaciones.';
