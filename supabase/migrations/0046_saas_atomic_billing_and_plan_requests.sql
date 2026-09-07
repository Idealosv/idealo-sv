alter table public.saas_billing_events
  add column if not exists idempotency_key text,
  add column if not exists receipt_number text;

create unique index if not exists uq_saas_billing_events_idempotency
  on public.saas_billing_events(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists uq_saas_billing_events_receipt
  on public.saas_billing_events(receipt_number)
  where receipt_number is not null;

create table if not exists public.saas_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.saas_company_subscriptions(id) on delete cascade,
  current_plan_id uuid references public.saas_plans(id),
  requested_plan_id uuid not null references public.saas_plans(id),
  requested_by uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text not null default '',
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

alter table public.saas_plan_change_requests enable row level security;
revoke all on public.saas_plan_change_requests from anon, authenticated;

create unique index if not exists uq_saas_plan_change_pending
  on public.saas_plan_change_requests(company_id)
  where status='pending';

create or replace function public.saas_record_payment_atomic(
  p_company_id uuid,
  p_amount numeric,
  p_reference text,
  p_charge_type text,
  p_actor text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sub public.saas_company_subscriptions%rowtype;
  v_event public.saas_billing_events%rowtype;
  v_existing public.saas_billing_events%rowtype;
  v_now timestamptz := now();
  v_start timestamptz;
  v_receipt text;
begin
  if p_company_id is null or coalesce(p_amount,0)<=0 then
    raise exception 'Empresa y monto válido son obligatorios.' using errcode='P0001';
  end if;
  if p_charge_type not in ('activation','monthly','other') then
    raise exception 'Tipo de cobro inválido.' using errcode='P0001';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'La llave idempotente es obligatoria.' using errcode='P0001';
  end if;

  select * into v_existing
  from public.saas_billing_events
  where idempotency_key=p_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'event_id',v_existing.id,'receipt_number',v_existing.receipt_number,'charge_type',coalesce(v_existing.metadata->>'charge_type','other'));
  end if;

  select * into v_sub
  from public.saas_company_subscriptions
  where company_id=p_company_id
  for update;
  if not found then
    raise exception 'La empresa no tiene suscripción.' using errcode='P0001';
  end if;

  if p_charge_type='activation' and v_sub.activation_paid_at is not null then
    raise exception 'La activación ya está registrada como pagada.' using errcode='P0001';
  end if;

  v_receipt := 'IDEALO-' || to_char(v_now,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.saas_billing_events(
    company_id,subscription_id,event_type,amount,currency,external_reference,metadata,idempotency_key,receipt_number
  ) values (
    p_company_id,v_sub.id,
    case when p_charge_type='activation' then 'ACTIVATION_PAYMENT_RECORDED' else 'PAYMENT_RECORDED' end,
    p_amount,'USD',nullif(trim(coalesce(p_reference,'')),''),
    jsonb_build_object('actor',coalesce(p_actor,''),'charge_type',p_charge_type),
    p_idempotency_key,v_receipt
  ) returning * into v_event;

  if p_charge_type='activation' then
    update public.saas_company_subscriptions
       set activation_paid_at=v_now,
           activation_paid_amount=p_amount,
           activation_reference=nullif(trim(coalesce(p_reference,'')),''),
           last_payment_at=v_now,
           last_payment_amount=p_amount,
           last_payment_reference=nullif(trim(coalesce(p_reference,'')),''),
           updated_at=v_now
     where id=v_sub.id;
  elsif p_charge_type='monthly' then
    v_start := greatest(v_now,coalesce(v_sub.current_period_end,v_now));
    update public.saas_company_subscriptions
       set status='active',
           suspended_at=null,
           cancelled_at=null,
           grace_ends_at=null,
           trial_ends_at=null,
           current_period_start=v_start,
           current_period_end=v_start+interval '30 days',
           last_payment_at=v_now,
           last_payment_amount=p_amount,
           last_payment_reference=nullif(trim(coalesce(p_reference,'')),''),
           updated_at=v_now
     where id=v_sub.id;
    update public.saas_payment_reminders
       set status='dismissed'
     where subscription_id=v_sub.id and status='pending';
  else
    update public.saas_company_subscriptions
       set last_payment_at=v_now,
           last_payment_amount=p_amount,
           last_payment_reference=nullif(trim(coalesce(p_reference,'')),''),
           updated_at=v_now
     where id=v_sub.id;
  end if;

  return jsonb_build_object('ok',true,'duplicate',false,'event_id',v_event.id,'receipt_number',v_receipt,'charge_type',p_charge_type,'reactivated',p_charge_type='monthly');
end;
$$;

revoke all on function public.saas_record_payment_atomic(uuid,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.saas_record_payment_atomic(uuid,numeric,text,text,text,text) to service_role,postgres;
