create or replace function public.saas_company_operational_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when p_company_id is null then false
    when not exists(select 1 from public.saas_company_subscriptions s where s.company_id=p_company_id) then true
    else exists(
      select 1
      from public.saas_company_subscriptions s
      where s.company_id=p_company_id
        and (
          s.status in ('trial','active')
          or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at>now())
        )
    )
  end
$$;

revoke all on function public.saas_company_operational_access(uuid) from public,anon;
grant execute on function public.saas_company_operational_access(uuid) to authenticated,service_role,postgres;

do $$
declare t text;
begin
  foreach t in array array['clients','finished_products','quotes','work_orders','inventory_items','suppliers','purchases','expenses','cash_accounts','customer_payments','dte_documents'] loop
    execute format('drop policy if exists saas_operational_gate on public.%I',t);
    execute format('create policy saas_operational_gate on public.%I as restrictive for all to authenticated using (public.saas_company_operational_access(company_id)) with check (public.saas_company_operational_access(company_id))',t);
  end loop;
end $$;
