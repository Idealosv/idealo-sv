-- Cierre V1: reducir superficie de ejecución de RPC privilegiadas.
-- Las funciones de escritura conservan acceso authenticated únicamente cuando son
-- puntos de entrada de la aplicación y ya validan empresa/rol internamente.
-- Helpers internos quedan reservados a service_role/postgres.

begin;

-- Helpers internos: no son API pública para clientes autenticados.
revoke execute on function public.erp_company_role(uuid) from public, anon, authenticated;
grant execute on function public.erp_company_role(uuid) to service_role, postgres;

revoke execute on function public.is_company_member(uuid) from public, anon, authenticated;
grant execute on function public.is_company_member(uuid) to service_role, postgres;

-- Lecturas explícitas de la app: autenticado, sin acceso anónimo.
revoke execute on function public.get_my_companies() from public, anon;
grant execute on function public.get_my_companies() to authenticated, service_role, postgres;

-- Auditoría fiscal-financiera exige usuario autenticado y validación interna de empresa.
revoke execute on function public.audit_dte_financial_integrity(uuid, date, date) from public, anon;
grant execute on function public.audit_dte_financial_integrity(uuid, date, date) to authenticated, service_role, postgres;

-- Numeración DTE: el usuario final no consume correlativos directamente.
revoke execute on function public.next_dte_control_number(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.next_dte_control_number(uuid, text, text, text, text) to service_role, postgres;

-- Helpers de autorización pueden ser evaluados por RLS/RPC bajo authenticated,
-- pero nunca por anon/public.
revoke execute on function public.erp_can_read(uuid) from public, anon;
revoke execute on function public.erp_can_operate(uuid) from public, anon;
revoke execute on function public.erp_can_admin(uuid) from public, anon;
revoke execute on function public.erp_can_read_finance(uuid) from public, anon;
grant execute on function public.erp_can_read(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_operate(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_admin(uuid) to authenticated, service_role, postgres;
grant execute on function public.erp_can_read_finance(uuid) to authenticated, service_role, postgres;

commit;
