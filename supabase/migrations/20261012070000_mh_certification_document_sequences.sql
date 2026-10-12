-- Numeración segura para los nuevos tipos de DTE del programa de certificación MH.
-- Solo TEST 00. No habilita numeración de producción ni modifica la función 01/03.
create or replace function public.next_certification_dte_control_number(
  p_company_id uuid, p_dte_type text
) returns text
language plpgsql security definer set search_path=public as $$
declare
  v_value bigint;
  v_local_max bigint;
  v_role text;
  v_has_subscription boolean:=false;
  v_dte_allowed boolean:=false;
begin
  if p_dte_type not in ('04','05','06','07','08','09','11','14','15') then
    raise exception 'DTE_TYPE_INVALID';
  end if;
  if auth.uid() is null and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'AUTH_REQUIRED';
  end if;
  if coalesce(auth.role(),'')<>'service_role' then
    select lower(cm.role::text) into v_role from public.company_members cm
     where cm.company_id=p_company_id and cm.user_id=auth.uid();
    if v_role not in ('owner','admin') then raise exception 'DTE_ROLE_FORBIDDEN'; end if;
  end if;
  if not exists(select 1 from public.companies where id=p_company_id) then
    raise exception 'COMPANY_NOT_FOUND';
  end if;
  select true, coalesce(p.dte_enabled,false) and
      (s.status in ('trial','active') or (s.status='past_due' and s.grace_ends_at>=now()))
  into v_has_subscription,v_dte_allowed
  from public.saas_company_subscriptions s join public.saas_plans p on p.id=s.plan_id
  where s.company_id=p_company_id limit 1;
  if coalesce(v_has_subscription,false) and not coalesce(v_dte_allowed,false) then
    raise exception 'SAAS_DTE_PLAN_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text||':'||p_dte_type||':test'));
  select coalesce(max(split_part(control_number,'-',4)::bigint),0)
    into v_local_max
    from public.dte_documents
   where company_id=p_company_id and environment='test' and dte_type=p_dte_type
     and split_part(control_number,'-',4) ~ '^[0-9]{15}$';
  insert into public.dte_control_sequences(company_id,dte_type,environment,last_value)
    values(p_company_id,p_dte_type,'test',v_local_max+1)
    on conflict(company_id,dte_type,environment) do update
      set last_value=greatest(public.dte_control_sequences.last_value,v_local_max)+1,
          updated_at=now()
      returning last_value into v_value;
  return format('DTE-%s-M001P001-%s',p_dte_type,lpad(v_value::text,15,'0'));
end $$;

revoke all on function public.next_certification_dte_control_number(uuid,text)
  from public,anon,authenticated;
grant execute on function public.next_certification_dte_control_number(uuid,text)
  to service_role;
