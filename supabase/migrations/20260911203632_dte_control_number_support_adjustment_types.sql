create or replace function public.next_dte_control_number(p_company_id uuid,p_dte_type text,p_environment text default 'test')
returns text language plpgsql security definer set search_path to 'public' as $$
declare
 v_value bigint;
 v_local_max bigint;
 v_establishment text;
 v_pos text;
 v_role text;
 v_demo boolean:=false;
 v_service_role boolean:=coalesce(auth.role(),'')='service_role';
 v_has_subscription boolean:=false;
 v_dte_allowed boolean:=false;
 v_runtime_ok boolean:=false;
begin
 if p_dte_type not in ('01','03','05','06','07','11','14','15') then raise exception 'DTE_TYPE_INVALID'; end if;
 if p_environment not in ('test','production') then raise exception 'DTE_ENVIRONMENT_INVALID'; end if;
 if auth.uid() is null and not v_service_role then raise exception 'AUTH_REQUIRED'; end if;

 select coalesce(c.demo_mode,false),coalesce(nullif(c.establishment_code,''),'M001'),coalesce(nullif(c.point_of_sale_code,''),'P001')
 into v_demo,v_establishment,v_pos
 from public.companies c where c.id=p_company_id;
 if not found then raise exception 'COMPANY_NOT_FOUND'; end if;

 if not v_service_role then
  select lower(cm.role::text) into v_role
  from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=auth.uid();
  if v_role not in ('owner','admin') then raise exception 'DTE_ROLE_FORBIDDEN'; end if;
  if p_environment='production' and v_role<>'owner' then raise exception 'DTE_PRODUCTION_OWNER_REQUIRED'; end if;
 end if;

 select true,
        coalesce(p.dte_enabled,false) and
        (s.status in ('trial','active') or (s.status='past_due' and s.grace_ends_at is not null and s.grace_ends_at>=now()))
 into v_has_subscription,v_dte_allowed
 from public.saas_company_subscriptions s
 join public.saas_plans p on p.id=s.plan_id
 where s.company_id=p_company_id
 limit 1;
 if coalesce(v_has_subscription,false) and not coalesce(v_dte_allowed,false) then raise exception 'SAAS_DTE_PLAN_REQUIRED'; end if;

 if p_environment='production' then
  if v_demo then raise exception 'DEMO_DTE_PRODUCTION_FORBIDDEN'; end if;
  select exists(
   select 1 from public.dte_runtime_settings r
   where r.company_id=p_company_id and r.environment='production'
     and r.production_enabled=true and r.production_approved=true
  ) into v_runtime_ok;
  if not v_runtime_ok then raise exception 'DTE_PRODUCTION_NOT_APPROVED'; end if;
 else
  v_establishment:='M001';
  v_pos:='P001';
 end if;

 perform pg_advisory_xact_lock(hashtext(p_company_id::text||':'||p_dte_type||':'||p_environment));
 select coalesce(max((split_part(control_number,'-',4))::bigint),0)
 into v_local_max
 from public.dte_documents
 where company_id=p_company_id and dte_type=p_dte_type and environment=p_environment
   and split_part(control_number,'-',4) ~ '^[0-9]{15}$';

 insert into public.dte_control_sequences(company_id,dte_type,environment,last_value)
 values(p_company_id,p_dte_type,p_environment,v_local_max+1)
 on conflict(company_id,dte_type,environment) do update
 set last_value=greatest(public.dte_control_sequences.last_value,v_local_max)+1,updated_at=now()
 returning last_value into v_value;

 return format('DTE-%s-%s%s-%s',p_dte_type,v_establishment,v_pos,lpad(v_value::text,15,'0'));
end;$$;
