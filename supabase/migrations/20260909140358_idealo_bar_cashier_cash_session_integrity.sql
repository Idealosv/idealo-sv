-- IDEALO BAR · integra el rol Cajero con la Caja central de IDEALO SV.

create or replace function public.open_cash_register(p_company uuid,p_cash_account uuid,p_opening_balance numeric,p_business_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.cash_accounts%rowtype; v_id uuid;
begin
 select * into a from public.cash_accounts where id=p_cash_account and company_id=p_company and active=true and upper(account_type)<>'BANK' for update;
 if not found then raise exception 'Caja no disponible'; end if;
 if not (public.erp_can_admin(p_company) or public.bar_has_permission(p_company,'cash.open')) then raise exception 'Tu rol no puede abrir caja'; end if;
 if p_opening_balance is null or p_opening_balance<0 then raise exception 'Efectivo inicial inválido'; end if;
 insert into public.cash_register_sessions(company_id,cash_account_id,business_date,opening_balance,opened_by) values(p_company,p_cash_account,coalesce(p_business_date,current_date),round(p_opening_balance,2),auth.uid()) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.create_cash_register_cut(p_session uuid,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.cash_register_sessions%rowtype; v_in numeric; v_out numeric; v_count int; v_expected numeric; v_id uuid;
begin
 select * into s from public.cash_register_sessions where id=p_session for update; if not found then raise exception 'Turno de caja no encontrado'; end if;
 if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.cut')) then raise exception 'Tu rol no puede hacer cortes de caja'; end if;
 if s.status<>'OPEN' then raise exception 'La caja ya está cerrada'; end if;
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),count(*) into v_in,v_out,v_count from public.cash_movements where company_id=s.company_id and cash_register_session_id=s.id;
 v_expected:=round(s.opening_balance+v_in-v_out,2);
 insert into public.cash_register_cuts(session_id,company_id,cash_account_id,expected_balance,income_total,expense_total,movement_count,created_by,notes) values(s.id,s.company_id,s.cash_account_id,v_expected,v_in,v_out,v_count,auth.uid(),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.close_cash_register(p_session uuid,p_counted numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cash_register_sessions%rowtype; v_in numeric; v_out numeric; v_expected numeric; v_diff numeric;
begin
 select * into s from public.cash_register_sessions where id=p_session for update; if not found then raise exception 'Turno de caja no encontrado'; end if;
 if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.close')) then raise exception 'Tu rol no puede cerrar caja'; end if;
 if s.status='CLOSED' then return jsonb_build_object('expected',s.closing_expected,'counted',s.closing_counted,'difference',s.difference,'already_closed',true); end if;
 if p_counted is null or p_counted<0 then raise exception 'Efectivo contado inválido'; end if;
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0) into v_in,v_out from public.cash_movements where company_id=s.company_id and cash_register_session_id=s.id;
 v_expected:=round(s.opening_balance+v_in-v_out,2); v_diff:=round(p_counted-v_expected,2);
 update public.cash_register_sessions set status='CLOSED',closing_expected=v_expected,closing_counted=round(p_counted,2),difference=v_diff,notes=nullif(trim(coalesce(p_notes,'')),''),closed_at=now(),closed_by=auth.uid() where id=s.id;
 return jsonb_build_object('expected',v_expected,'counted',round(p_counted,2),'difference',v_diff,'already_closed',false);
end;$$;
