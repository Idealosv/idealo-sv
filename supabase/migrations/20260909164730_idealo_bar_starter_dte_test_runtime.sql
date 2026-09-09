create or replace function public.bar_prepare_dte_test_runtime(p_company_id uuid)
returns jsonb
language plpgsql
set search_path=public
as $$
begin
  if auth.uid() is not null and not public.erp_can_admin(p_company_id) and not public.bar_has_permission(p_company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede preparar DTE TEST.';
  end if;
  insert into public.dte_runtime_settings(company_id,environment,production_enabled,production_approved,approved_at,approved_by,updated_at,updated_by)
  values(p_company_id,'test',false,false,null,null,now(),auth.uid())
  on conflict(company_id) do update set environment='test',production_enabled=false,production_approved=false,approved_at=null,approved_by=null,updated_at=now(),updated_by=auth.uid();
  update public.bar_settings set default_dte_environment='test',default_dte_type='01',auto_dte_on_paid=true,updated_at=now(),updated_by=auth.uid() where company_id=p_company_id;
  return jsonb_build_object('environment','test','production_enabled',false,'production_approved',false,'message','DTE TEST preparado; PRODUCCIÓN permanece bloqueada hasta completar preflight fiscal.');
end;
$$;
grant execute on function public.bar_prepare_dte_test_runtime(uuid) to authenticated;
