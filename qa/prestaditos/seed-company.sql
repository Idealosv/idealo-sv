-- QA EXCLUSIVAMENTE LOCAL: empresas falsas con vertical financiera existente.
insert into public.saas_company_subscriptions(company_id,vertical_id,plan_id,status)
select c.id,v.id,p.id,'active'
from public.companies c
cross join public.saas_verticals v
cross join public.saas_plans p
where c.id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
 and v.code='FINANCIAL_INVESTORS'
 and p.id='12341234-1234-4234-8234-123412341234'
on conflict(company_id) do update set vertical_id=excluded.vertical_id,status='active';
