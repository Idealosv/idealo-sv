create extension if not exists pg_cron;

create or replace function public.saas_enforce_subscription_statuses()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  marked_past_due integer := 0;
  marked_suspended integer := 0;
begin
  with changed as (
    update public.saas_company_subscriptions
       set status = 'past_due',
           grace_ends_at = coalesce(grace_ends_at, current_period_end + interval '3 days'),
           updated_at = now()
     where status = 'active'
       and current_period_end is not null
       and current_period_end < now()
    returning id
  ) select count(*) into marked_past_due from changed;

  with changed as (
    update public.saas_company_subscriptions
       set status = 'suspended',
           suspended_at = coalesce(suspended_at, now()),
           updated_at = now()
     where status = 'past_due'
       and coalesce(grace_ends_at, current_period_end + interval '3 days') < now()
    returning id
  ) select count(*) into marked_suspended from changed;

  return jsonb_build_object('past_due', marked_past_due, 'suspended', marked_suspended, 'ran_at', now());
end;
$$;

revoke all on function public.saas_enforce_subscription_statuses() from public, anon, authenticated;
grant execute on function public.saas_enforce_subscription_statuses() to postgres;

select cron.schedule(
  'saas-membership-status-enforcement',
  '17 * * * *',
  $$select public.saas_enforce_subscription_statuses();$$
);
