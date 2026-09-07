alter table public.saas_company_subscriptions
  add column if not exists last_payment_at timestamptz,
  add column if not exists last_payment_amount numeric(12,2),
  add column if not exists last_payment_reference text;

create table if not exists public.saas_payment_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.saas_company_subscriptions(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('DUE_7','DUE_3','DUE_1','DUE_TODAY','PAST_DUE','SUSPENDED')),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','sent','dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(subscription_id, reminder_type, due_at)
);

alter table public.saas_payment_reminders enable row level security;
revoke all on public.saas_payment_reminders from anon, authenticated;

create or replace function public.saas_refresh_commercial_lifecycle()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_past_due integer := 0;
  v_suspended integer := 0;
  v_reminders integer := 0;
begin
  update public.saas_company_subscriptions
     set status='past_due',
         grace_ends_at=coalesce(grace_ends_at, current_period_end + interval '3 days'),
         updated_at=now()
   where status='active'
     and current_period_end is not null
     and current_period_end < now();
  get diagnostics v_past_due = row_count;

  update public.saas_company_subscriptions
     set status='suspended', suspended_at=coalesce(suspended_at,now()), updated_at=now()
   where status='past_due' and grace_ends_at is not null and grace_ends_at < now();
  get diagnostics v_suspended = row_count;

  insert into public.saas_payment_reminders(company_id,subscription_id,reminder_type,due_at)
  select company_id,id,
    case
      when current_period_end::date=current_date+7 then 'DUE_7'
      when current_period_end::date=current_date+3 then 'DUE_3'
      when current_period_end::date=current_date+1 then 'DUE_1'
      else 'DUE_TODAY'
    end,
    current_period_end
  from public.saas_company_subscriptions
  where status='active' and current_period_end::date in (current_date,current_date+1,current_date+3,current_date+7)
  on conflict do nothing;
  get diagnostics v_reminders = row_count;

  insert into public.saas_payment_reminders(company_id,subscription_id,reminder_type,due_at)
  select company_id,id,'PAST_DUE',current_period_end from public.saas_company_subscriptions where status='past_due'
  on conflict do nothing;

  insert into public.saas_payment_reminders(company_id,subscription_id,reminder_type,due_at)
  select company_id,id,'SUSPENDED',grace_ends_at from public.saas_company_subscriptions where status='suspended' and grace_ends_at is not null
  on conflict do nothing;

  return jsonb_build_object('past_due',v_past_due,'suspended',v_suspended,'reminders_created',v_reminders);
end;
$$;

revoke all on function public.saas_refresh_commercial_lifecycle() from public, anon, authenticated;
