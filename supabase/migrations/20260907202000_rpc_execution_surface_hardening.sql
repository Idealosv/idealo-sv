-- Cierre V1: reducir superficie de ejecución de RPC privilegiadas.
-- Helpers internos quedan reservados a service_role/postgres; las entradas de app
-- mantienen únicamente los privilegios mínimos requeridos.

begin;

revoke execute on function public.erp_company_role(uuid) from public, anon, authenticated;
grant execute on function public.erp_company_role(uuid) to service_role, postgres;

revoke execute on function public.is_company_member(uuid) from public, anon, authenticated;
grant execute on function public.is_company_member(uuid) to service_role, postgres;

revoke execute on function public.get_my_companies() from public, anon;
grant execute on function public.get_my_companies() to authenticated, service_role, postgres;

revoke execute on function public.audit_dte_financial_integrity(uuid) from public, anon;
grant execute on function public.audit_dte_financial_integrity(uuid) to authenticated, service_role, postgres;

-- La numeración DTE sólo puede ser consumida por el backend privilegiado.
revoke execute on function public.next_dte_control_number(uuid, text, text) from public, anon, authenticated;
grant execute on function public.next_dte_control_number(uuid, text, text) to service_role, postgres;

-- Helpers usados por RLS/RPC: authenticated sí, anon/public no.
revoke execute on function public.erp_can_read(uuid) from public, anon;
revoke execute on function public.erp_can_operate(uuid) from public, anon;
revoke execute on function public.erp_can_admin(uuid) from public, anon;
revoke execute on function public.erp_can_read_finance(uuid) from public, anon;
grant execute on function public.erp_can_read(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_operate(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_admin(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_read_finance(uuid) to authenticated, service_role, postgres;

commit;
