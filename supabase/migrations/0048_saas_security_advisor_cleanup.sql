alter function public.saas_company_operational_access(uuid) security invoker;

revoke all on function public.saas_company_operational_access(uuid) from public,anon;
grant execute on function public.saas_company_operational_access(uuid) to authenticated,service_role,postgres;

drop policy if exists saas_payment_reminders_no_direct_access on public.saas_payment_reminders;
create policy saas_payment_reminders_no_direct_access
on public.saas_payment_reminders
as restrictive
for all
to anon,authenticated
using (false)
with check (false);

drop policy if exists saas_plan_change_requests_no_direct_access on public.saas_plan_change_requests;
create policy saas_plan_change_requests_no_direct_access
on public.saas_plan_change_requests
as restrictive
for all
to anon,authenticated
using (false)
with check (false);
