create or replace function public.next_dte_control_number(p_company_id uuid, p_dte_type text, p_environment text default 'test') returns text language plpgsql security definer set search_path='public' as $$
declare v_value bigint; v_local_max bigint; v_establishment text; v_pos text; v_role text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select lower(cm.role) into v_role from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
 if v_role not in ('owner','admin') then raise exception 'DTE_ROLE_FORBIDDEN'; end if;
 if p_dte_type not in ('01','03') then raise exception 'DTE_TYPE_INVALID'; end if;
 if p_environment not in ('test','production') then raise exception 'DTE_ENVIRONMENT_INVALID'; end if;
 if p_environment='production' and v_role <> 'owner' then raise exception 'DTE_PRODUCTION_OWNER_REQUIRED'; end if;
 select coalesce(nullif(c.establishment_code,''),'M001'), coalesce(nullif(c.point_of_sale_code,''),'P001') into v_establishment,v_pos from public.companies c where c.id=p_company_id;
 if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
 if p_environment='test' then v_establishment:='M001'; v_pos:='P001'; end if;
 perform pg_advisory_xact_lock(hashtext(p_company_id::text||':'||p_dte_type||':'||p_environment));
 select coalesce(max((split_part(control_number,'-',4))::bigint),0) into v_local_max from public.dte_documents where company_id=p_company_id and dte_type=p_dte_type and environment=p_environment and split_part(control_number,'-',4) ~ '^[0-9]{15}$';
 insert into public.dte_control_sequences(company_id,dte_type,environment,last_value) values(p_company_id,p_dte_type,p_environment,v_local_max+1)
 on conflict(company_id,dte_type,environment) do update set last_value=greatest(public.dte_control_sequences.last_value,v_local_max)+1, updated_at=now() returning last_value into v_value;
 return format('DTE-%s-%s%s-%s',p_dte_type,v_establishment,v_pos,lpad(v_value::text,15,'0'));
end $$;
revoke execute on function public.next_dte_control_number(uuid,text,text) from public, anon;
grant execute on function public.next_dte_control_number(uuid,text,text) to authenticated;
