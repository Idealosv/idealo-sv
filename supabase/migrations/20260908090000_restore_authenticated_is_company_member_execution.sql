-- RLS usa is_company_member() para validar pertenencia a la empresa.
-- El hardening de RPC de V1 retiró por error EXECUTE a authenticated, lo que
-- hacía fallar las políticas y dejaba sin contexto a IDEALO Inteligente V3.

begin;

revoke execute on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated, service_role, postgres;

commit;
