create or replace function public.bar_money_words(p_amount numeric)
returns text language sql immutable set search_path=public as $$ select to_char(round(coalesce(p_amount,0),2),'FM9999999990.00')||' DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA' $$;
revoke execute on function public.bar_generate_dte_draft(uuid,uuid,text,text) from public,anon;
grant execute on function public.bar_generate_dte_draft(uuid,uuid,text,text) to authenticated;
revoke execute on function public.bar_reconcile_existing_tip(uuid) from public,anon;
grant execute on function public.bar_reconcile_existing_tip(uuid) to authenticated;
revoke execute on function public.bar_reconcile_tip_allocation() from public,anon,authenticated;
revoke execute on function public.bar_validate_tip_allocation() from public,anon,authenticated;
revoke execute on function public.bar_validate_bill_split() from public,anon,authenticated;
revoke execute on function public.bar_guard_print_job_write() from public,anon,authenticated;