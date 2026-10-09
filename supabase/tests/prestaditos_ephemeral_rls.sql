-- RUN ONLY IN GITHUB ACTIONS disposable PostgreSQL, NEVER in live Supabase.
-- Exercise real PostgreSQL RLS and the exact migration functions, with JWT mock auth.uid.
\set ON_ERROR_STOP on
\echo 'TEST 1: Anonymous user cannot see investor data or call privileged RPC'
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.email','',false);
set role anon;
select test.expect_error('select * from public.inv_portal_enrollments','anon cannot read private enrollments');
select test.expect_error('select public.inv_portal_dashboard(''11111111-1111-4111-8111-111111111111''::uuid)','anon cannot query financial dashboard');
reset role;

\echo 'TEST 2: Investor A registers, has no access before staff verification'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select test.expect_error('select public.inv_portal_dashboard(''11111111-1111-4111-8111-111111111111''::uuid)','no dashboard without approval');
insert into public.inv_portal_enrollments(company_id,user_id,full_name,dui,phone,email)
values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Ana Ficticia','90000001-1','70000001','investor-a@example.invalid');
select test.expect_error('insert into public.inv_portal_enrollments(company_id,user_id,full_name,dui,phone,email) values (''11111111-1111-4111-8111-111111111111'',''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'',''Fraud User'',''90000002-2'',''70000002'',''investor-b@example.invalid'')','A cannot register on behalf of B');
select test.expect_error('update public.inv_portal_enrollments set status=''APPROVED'' where user_id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''','user cannot self approve');
select test.expect_error('select public.inv_portal_submit_application(''11111111-1111-4111-8111-111111111111'',100,12,current_date,''Transferencia'','''','''')','unapproved user cannot submit investment');
reset role;

\echo 'TEST 3: Investor B separately registers'
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('request.jwt.claim.email','investor-b@example.invalid',false);
set role authenticated;
insert into public.inv_portal_enrollments(company_id,user_id,full_name,dui,phone,email)
values('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Beto Ficticio','90000002-2','70000002','investor-b@example.invalid');
select test.assert_true((select count(*)=1 from public.inv_portal_enrollments),'B sees only own enrollment');
select test.expect_error('select public.inv_portal_link_account(''00000000-0000-4000-8000-000000000000'',''b2222222-2222-4222-8222-222222222222'')','nonadmin cannot link identity');
reset role;

\echo 'TEST 4: Company B admin cannot approve company A; staff lacks power'
select set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',false);
select set_config('request.jwt.claim.email','admin-b@example.invalid',false);
set role authenticated;
select test.assert_true((select count(*)=0 from public.inv_portal_enrollments),'cross-company admin cannot read A enrollment');
select test.expect_error('select public.inv_portal_link_account((select id from public.inv_portal_enrollments limit 1),''a1111111-1111-4111-8111-111111111111'')','wrong company cannot link');
reset role;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
select set_config('request.jwt.claim.email','staff-a@example.invalid',false);
set role authenticated;
select test.expect_error('select public.inv_portal_link_account(''00000000-0000-4000-8000-000000000000'',''a1111111-1111-4111-8111-111111111111'')','staff cannot approve');
reset role;

\echo 'TEST 5: Company A admin approves verified A and B records'
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
select set_config('request.jwt.claim.email','admin-a@example.invalid',false);
set role authenticated;
select public.inv_portal_link_account(
 (select id from public.inv_portal_enrollments where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 'a1111111-1111-4111-8111-111111111111');
select public.inv_portal_link_account(
 (select id from public.inv_portal_enrollments where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 'b2222222-2222-4222-8222-222222222222');
select test.assert_true((select count(*)=2 from public.inv_portal_enrollments where status='APPROVED'),'both registrations were verified');
select test.assert_true((select count(*)=2 from public.inv_audit_log where action='PORTAL_ACCESS_APPROVED'),'approvals audited');
reset role;

\echo 'TEST 6: A can query only A; B financial information is hidden'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select test.assert_true((public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'investor'->>'id')='a1111111-1111-4111-8111-111111111111','A dashboard only A investor');
select test.assert_true(jsonb_array_length(public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'investments')=1,'A only A investment');
select test.assert_true(jsonb_array_length(public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'payments')=1,'A only A payment');
select test.assert_true((select count(*)=0 from public.inv_investors),'A cannot bypass ERP membership RLS to list company investors');
select test.assert_true((select count(*)=0 from public.inv_payments),'A cannot query payments table outside controlled RPC');
select test.expect_error('select public.inv_portal_dashboard(''22222222-2222-4222-8222-222222222222''::uuid)','A cannot open company B dashboard');
select test.expect_error('insert into public.inv_portal_links(company_id,user_id,investor_id) values (''11111111-1111-4111-8111-111111111111'',''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''b2222222-2222-4222-8222-222222222222'')','A cannot create unauthorized investor link');
select public.inv_portal_submit_application(
 '11111111-1111-4111-8111-111111111111',450,12,current_date,'Transferencia','Oficina QA','Solicitud ficticia') as a_app_id \gset
select test.assert_true(jsonb_array_length(public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'applications')=1,'submitted application appears in single existing ERP ledger');
select test.expect_error('select public.inv_portal_submit_withdrawal(''11111111-1111-4111-8111-111111111111'',''b5555555-5555-4555-8555-555555555555'',''CAPITAL_RETURN'',100,''Transferencia'','''')','A cannot request B investment withdrawal');
reset role;

\echo 'TEST 7: B remains isolated from A'
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('request.jwt.claim.email','investor-b@example.invalid',false);
set role authenticated;
select test.assert_true((public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'investor'->>'id')='b2222222-2222-4222-8222-222222222222','B dashboard remains B');
select test.assert_true(jsonb_array_length(public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'applications')=0,'B cannot see A application');
select test.assert_true((select count(*)=1 from public.inv_portal_enrollments),'B sees only B registration');
reset role;

\echo 'TEST 8: Upload owner and staff may see receipt, other investor denied'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
insert into storage.objects(bucket_id,name) values
 ('prestaditos-portal-receipts','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||:'a_app_id'||'/test-proof.pdf');
select test.assert_true((select count(*)=1 from storage.objects where bucket_id='prestaditos-portal-receipts'),'A sees own storage object');
select public.inv_portal_attach_receipt(:'a_app_id'::uuid,
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||:'a_app_id'||'/test-proof.pdf');
select test.expect_error('select public.inv_portal_attach_receipt('''||:'a_app_id'||''',''11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||:'a_app_id'||'/test-proof.pdf'')','same application cannot attach a different receipt again');
reset role;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('request.jwt.claim.email','investor-b@example.invalid',false);
set role authenticated;
select test.assert_true((select count(*)=0 from storage.objects where bucket_id='prestaditos-portal-receipts'),'B cannot see A receipt');
select test.expect_error('insert into storage.objects(bucket_id,name) values (''prestaditos-portal-receipts'',''11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||:'a_app_id'||'/forged.pdf'')','B cannot upload to A folder');
reset role;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
select set_config('request.jwt.claim.email','admin-a@example.invalid',false);
set role authenticated;
select test.assert_true((select count(*)=1 from storage.objects where bucket_id='prestaditos-portal-receipts'),'authorized company admin can view receipt');
reset role;
select set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',false);
select set_config('request.jwt.claim.email','admin-b@example.invalid',false);
set role authenticated;
select test.assert_true((select count(*)=0 from storage.objects where bucket_id='prestaditos-portal-receipts'),'another company admin cannot view receipt');
reset role;

\echo 'TEST 9: Parallel-capital safety and review transitions'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select public.inv_portal_submit_withdrawal(
 '11111111-1111-4111-8111-111111111111',
 'a4444444-4444-4444-8444-444444444444','CAPITAL_RETURN',600,'Transferencia','Fake capital request') as a_withdraw_id \gset
select test.expect_error('select public.inv_portal_submit_withdrawal(''11111111-1111-4111-8111-111111111111'',''a4444444-4444-4444-8444-444444444444'',''CAPITAL_RETURN'',500,''Transferencia'','''')','second capital withdrawal would exceed reserved balance');
select test.expect_error('update public.inv_portal_withdrawals set status=''COMPLETED'' where id='''||:'a_withdraw_id'||'''','A cannot finalize own withdrawal');
reset role;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
select set_config('request.jwt.claim.email','staff-a@example.invalid',false);
set role authenticated;
select test.expect_error('select public.inv_portal_review_withdrawal('''||:'a_withdraw_id'||''',''REVIEW'')','staff cannot review capital withdrawal');
reset role;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
select set_config('request.jwt.claim.email','admin-a@example.invalid',false);
set role authenticated;
select public.inv_portal_review_withdrawal(:'a_withdraw_id'::uuid,'REVIEW');
select public.inv_portal_review_withdrawal(:'a_withdraw_id'::uuid,'APPROVED');
select test.expect_error('select public.inv_portal_review_withdrawal('''||:'a_withdraw_id'||''',''COMPLETED'','''',null)','cannot mark complete without real matching posted payment');
reset role;
-- Administrative posted-payment fixture; NOT a real money transfer.
insert into public.inv_payments(id,company_id,investor_id,investment_id,payment_type,amount,payment_date,reference,status,payment_code)
values('a9999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
 'a1111111-1111-4111-8111-111111111111','a4444444-4444-4444-8444-444444444444',
 'CAPITAL_RETURN',600,current_date,'QA-FICTICIOUS','POSTED','QA-CAP-600');
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
select set_config('request.jwt.claim.email','admin-a@example.invalid',false);
set role authenticated;
select public.inv_portal_review_withdrawal(:'a_withdraw_id'::uuid,'COMPLETED','Payment in mock ledger','a9999999-9999-4999-8999-999999999999');
select test.assert_true((select count(*)=1 from public.inv_portal_withdrawals where status='COMPLETED'),'capital withdrawal completed after matching payment');
select test.expect_error('select public.inv_portal_review_withdrawal('''||:'a_withdraw_id'||''',''COMPLETED'','''',''a9999999-9999-4999-8999-999999999999'')','cannot complete same withdrawal twice');
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select test.expect_error('select public.inv_portal_submit_withdrawal(''11111111-1111-4111-8111-111111111111'',''a4444444-4444-4444-8444-444444444444'',''CAPITAL_RETURN'',500,''Transferencia'','''')','cannot withdraw 500 after 600 of 1000 paid');
reset role;

\echo 'TEST 10: Posted payment reversal must be visible as alert'
update public.inv_payments set status='REVERSED' where id='a9999999-9999-4999-8999-999999999999';
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select test.assert_true((public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'withdrawals'->0->>'status')='PAYMENT_REVERSED','reversed payment does not silently display as completed');
reset role;
\echo 'ALL TEMPORARY POSTGRES SECURITY TESTS PASSED'
