-- PRESTADITO$ / IDEALO SV
-- Endurecimiento de seguridad: ningún RPC inv_* queda ejecutable por anon/public.
-- Se reabre únicamente el conjunto de funciones que usa el vertical autenticado.

do $$
declare
  v_regprocedure text;
begin
  for v_regprocedure in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname like 'inv_%'
  loop
    execute format('revoke execute on function %s from public',v_regprocedure);
    execute format('revoke execute on function %s from anon',v_regprocedure);
  end loop;
end $$;

-- Helpers que necesitan las políticas/RPC bajo sesión autenticada.
grant execute on function public.inv_company_member(uuid) to authenticated,service_role;
grant execute on function public.inv_company_can_submit(uuid) to authenticated,service_role;
grant execute on function public.inv_company_can_review(uuid) to authenticated,service_role;
grant execute on function public.inv_rate_allowed(numeric) to authenticated,service_role;

-- Flujo de solicitudes e inversiones.
grant execute on function public.inv_transition_application(uuid,text,text,numeric,integer) to authenticated,service_role;
grant execute on function public.inv_formalize_application(uuid,date,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.inv_formalize_application_with_rate(uuid,date,numeric,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.inv_update_investment_details(uuid,text,numeric,text,text,text) to authenticated,service_role;
grant execute on function public.inv_set_investment_return_rate(uuid,numeric,text) to authenticated,service_role;

-- Pagos.
grant execute on function public.inv_record_payment(uuid,text,numeric,date,text,text,text,text) to authenticated,service_role;
grant execute on function public.inv_reverse_payment(uuid,text) to authenticated,service_role;

-- Beneficiarios.
grant execute on function public.inv_save_beneficiary(uuid,uuid,uuid,text,text,date,text,text,text,text,text,numeric,text) to authenticated,service_role;
grant execute on function public.inv_set_beneficiary_active(uuid,boolean,text) to authenticated,service_role;

-- Renovaciones / retiro.
grant execute on function public.inv_save_renewal_decision(uuid,text,numeric,integer,date,text,text,text) to authenticated,service_role;
grant execute on function public.inv_cancel_renewal_decision(uuid,text) to authenticated,service_role;
grant execute on function public.inv_execute_renewal(uuid,numeric,text) to authenticated,service_role;
grant execute on function public.inv_finalize_withdrawal(uuid,boolean,text) to authenticated,service_role;

-- Documentos y contratos.
grant execute on function public.inv_record_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,date,text) to authenticated,service_role;
grant execute on function public.inv_set_document_active(uuid,boolean,text) to authenticated,service_role;
grant execute on function public.inv_prepare_contract(uuid,numeric,text) to authenticated,service_role;
grant execute on function public.inv_mark_contract_signed(uuid,uuid,text) to authenticated,service_role;

-- Configuración, notificaciones y cierre mensual.
grant execute on function public.inv_save_company_settings(uuid,integer[],text[],text[],text) to authenticated,service_role;
grant execute on function public.inv_set_notification_state(uuid,text,text,text,text,text,text,text,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.inv_clear_notification_state(uuid,text) to authenticated,service_role;
grant execute on function public.inv_generate_monthly_closeout(uuid,date,text) to authenticated,service_role;

comment on schema public is 'IDEALO SV public schema; Prestadito$ inv_* RPC are explicitly denied to anon.';
