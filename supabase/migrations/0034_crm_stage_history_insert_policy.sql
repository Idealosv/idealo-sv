drop policy if exists crm_stage_history_insert_company on public.crm_opportunity_stage_history;
create policy crm_stage_history_insert_company on public.crm_opportunity_stage_history
for insert to authenticated
with check (
  public.is_company_member(company_id)
  and exists (
    select 1 from public.crm_opportunities o
    where o.id = opportunity_id and o.company_id = company_id
  )
);

grant insert on public.crm_opportunity_stage_history to authenticated;
revoke update, delete on public.crm_opportunity_stage_history from authenticated;
