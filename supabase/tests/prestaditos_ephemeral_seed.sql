-- PostgreSQL fixtures for local CI only. Everything here is fabricated.
update public.saas_company_subscriptions set vertical_id=(select id from public.saas_verticals where code='FINANCIAL_INVESTORS');
insert into public.inv_investors(id,company_id,investor_code,first_names,last_names,dui,email,status) values
 ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','INV-QA-A','Ana','Ficticia','90000001-1','investor-a@example.invalid','ACTIVE'),
 ('b2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','INV-QA-B','Beto','Ficticio','90000002-2','investor-b@example.invalid','ACTIVE'),
 ('c3333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','INV-QA-C','Carmen','Ficticia','90000003-3','carmen@example.invalid','ACTIVE');
insert into public.inv_investments(id,company_id,investor_id,investment_code,principal,granted_at,term_months,maturity_date,agreed_return_rate,status) values
 ('a4444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','INVEST-QA-A',1000,current_date,12,current_date+365,10,'ACTIVE'),
 ('b5555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','INVEST-QA-B',2000,current_date,12,current_date+365,12,'ACTIVE'),
 ('c6666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','c3333333-3333-4333-8333-333333333333','INVEST-QA-C',3000,current_date,12,current_date+365,15,'ACTIVE');
insert into public.inv_payments(id,company_id,investor_id,investment_id,payment_type,amount,payment_date,reference,status,payment_code) values
 ('a7777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','a4444444-4444-4444-8444-444444444444','YIELD',100,current_date,'QA-NO-REAL','POSTED','QA-PAY-A-1'),
 ('b8888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','b5555555-5555-4555-8555-555555555555','YIELD',240,current_date,'QA-NO-REAL','POSTED','QA-PAY-B-1');
