-- PRESTADITO$ staging smoke test
-- READ-ONLY: this file validates schema/security readiness and does not insert, update or delete data.
-- Run only against a non-production Supabase database.

do $$
declare
  missing text[] := '{}';
  tbl text;
  fn text;
  rls_missing text[] := '{}';
begin
  foreach tbl in array array[
    'inv_investors',
    'inv_beneficiaries',
    'inv_applications',
    'inv_application_events',
    'inv_investments',
    'inv_payments',
    'inv_renewal_decisions',
    'inv_documents',
    'inv_contracts',
    'inv_audit_log',
    'inv_company_settings',
    'inv_notification_states',
    'inv_monthly_closeouts'
  ]
  loop
    if to_regclass('public.'||tbl) is null then
      missing := array_append(missing,tbl);
    end if;
  end loop;

  if cardinality(missing)>0 then
    raise exception 'PRESTADITOS_SMOKE: missing tables: %',array_to_string(missing,', ');
  end if;

  foreach fn in array array[
    'inv_formalize_application_with_rate(uuid,date,numeric,text,numeric,text,text)',
    'inv_record_payment(uuid,text,numeric,date,text,text,text,text)',
    'inv_reverse_payment(uuid,text)',
    'inv_save_beneficiary(uuid,uuid,uuid,text,text,date,text,text,text,text,text,numeric,text)',
    'inv_save_renewal_decision(uuid,text,numeric,integer,date,text,text,text)',
    'inv_execute_renewal(uuid,numeric,text)',
    'inv_finalize_withdrawal(uuid,boolean,text)',
    'inv_record_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,date,text)',
    'inv_prepare_contract(uuid,numeric,text)',
    'inv_mark_contract_signed(uuid,uuid,text)',
    'inv_save_company_settings(uuid,integer[],text[],text[],text)',
    'inv_set_notification_state(uuid,text,text,text,text,text,text,text,uuid,uuid,text)',
    'inv_clear_notification_state(uuid,text)',
    'inv_generate_monthly_closeout(uuid,date,text)'
  ]
  loop
    if to_regprocedure('public.'||fn) is null then
      raise exception 'PRESTADITOS_SMOKE: missing function: %',fn;
    end if;
  end loop;

  select coalesce(array_agg(c.relname order by c.relname),'{}'::text[])
    into rls_missing
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname like 'inv_%'
    and c.relkind='r'
    and c.relname in (
      'inv_investors','inv_beneficiaries','inv_applications','inv_application_events',
      'inv_investments','inv_payments','inv_renewal_decisions','inv_documents',
      'inv_contracts','inv_audit_log','inv_company_settings','inv_notification_states',
      'inv_monthly_closeouts'
    )
    and not c.relrowsecurity;

  if cardinality(rls_missing)>0 then
    raise exception 'PRESTADITOS_SMOKE: RLS disabled: %',array_to_string(rls_missing,', ');
  end if;

  if not exists(
    select 1
    from storage.buckets
    where id='investor-documents'
      and public=false
      and file_size_limit=10485760
  ) then
    raise exception 'PRESTADITOS_SMOKE: investor-documents bucket is missing, public, or has wrong limit';
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants
    where grantee='authenticated'
      and table_schema='public'
      and table_name in ('inv_payments','inv_investments','inv_documents','inv_contracts','inv_monthly_closeouts')
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'PRESTADITOS_SMOKE: sensitive tables expose direct authenticated writes';
  end if;

  if exists(
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema='public'
      and rp.grantee='anon'
      and rp.privilege_type='EXECUTE'
      and rp.routine_name like 'inv_%'
  ) then
    raise exception 'PRESTADITOS_SMOKE: one or more inv_* RPCs expose anonymous execute';
  end if;

  raise notice 'PRESTADITOS_SMOKE_OK: schema, RLS, storage and sensitive write controls passed.';
end $$;

select
  'PRESTADITOS_COUNTS' as check_name,
  (select count(*) from public.inv_investors) as investors,
  (select count(*) from public.inv_applications) as applications,
  (select count(*) from public.inv_investments) as investments,
  (select count(*) from public.inv_payments where coalesce(status,'POSTED')='POSTED') as posted_payments,
  (select count(*) from public.inv_contracts) as contracts,
  (select count(*) from public.inv_documents where status='ACTIVE') as active_documents;
