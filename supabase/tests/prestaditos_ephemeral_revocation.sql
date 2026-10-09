-- Final revocation checks, performed only in the disposable QA database.
\set ON_ERROR_STOP on
\echo 'TEST 11: Blocking a previously approved investor instantly revokes financial access'
update public.inv_investors set status='BLOCKED'
 where id='a1111111-1111-4111-8111-111111111111';
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('request.jwt.claim.email','investor-a@example.invalid',false);
set role authenticated;
select test.expect_error('select public.inv_portal_dashboard(''11111111-1111-4111-8111-111111111111''::uuid)','blocked A cannot retrieve investment balances');
select test.assert_true((select count(*)=0 from public.inv_portal_withdrawals),'blocked A cannot read withdrawal history directly');
select test.assert_true((select count(*)=0 from storage.objects where bucket_id='prestaditos-portal-receipts'),'blocked A cannot read private proof');
select test.expect_error('select public.inv_portal_submit_application(''11111111-1111-4111-8111-111111111111'',100,12,current_date,''Transferencia'','''','''')','blocked A cannot submit another investment');
reset role;
\echo 'TEST 12: Unrelated investor B keeps personal access'
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select set_config('request.jwt.claim.email','investor-b@example.invalid',false);
set role authenticated;
select test.assert_true((public.inv_portal_dashboard('11111111-1111-4111-8111-111111111111'::uuid)->'investor'->>'id')='b2222222-2222-4222-8222-222222222222','B unaffected by blocking A');
reset role;
\echo 'ALL REVOCATION CHECKS PASSED'
