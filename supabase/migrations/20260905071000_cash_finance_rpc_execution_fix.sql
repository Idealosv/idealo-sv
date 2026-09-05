-- Mutating finance RPCs use SECURITY DEFINER only after validating company role internally.
alter function public.register_cash_transfer(uuid,uuid,numeric,text,text,uuid) security definer;
alter function public.register_cash_adjustment(uuid,text,numeric,text,uuid) security definer;
alter function public.reconcile_cash_account(uuid,numeric,date,text,text) security definer;
alter function public.close_cash_reconciliation(uuid,text) security definer;
alter function public.close_cash_day(uuid,date,text) security definer;
alter function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid) security definer;
alter function public.open_cash_register(uuid,uuid,numeric,date) security definer;
alter function public.create_cash_register_cut(uuid,text) security definer;
alter function public.close_cash_register(uuid,numeric,text) security definer;

do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('register_cash_transfer','register_cash_adjustment','reconcile_cash_account','close_cash_reconciliation','close_cash_day','register_customer_advance','open_cash_register','create_cash_register_cut','close_cash_register') loop
   execute format('revoke all on function %s from public, anon',r.sig);
   execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end $$;
