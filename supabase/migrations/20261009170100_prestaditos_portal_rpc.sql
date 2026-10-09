-- Staff links a verified account with a real inv_investors record (never auto-match).
create function public.inv_portal_link_account(p_enrollment uuid,p_investor uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare e public.inv_portal_enrollments%rowtype; i public.inv_investors%rowtype;
begin
 select * into e from public.inv_portal_enrollments where id=p_enrollment for update;
 if not found or e.status<>'PENDING' then raise exception 'Registro no pendiente'; end if;
 if not public.inv_company_can_review(e.company_id) then raise exception 'Acceso denegado'; end if;
 select * into i from public.inv_investors where id=p_investor and company_id=e.company_id and status='ACTIVE';
 if not found then raise exception 'Inversionista no encontrado o inactivo'; end if;
 if length(regexp_replace(e.dui,'[^0-9]','','g'))<>9 or regexp_replace(i.dui,'[^0-9]','','g')<>regexp_replace(e.dui,'[^0-9]','','g')
 then raise exception 'El DUI no coincide con el expediente'; end if;
 if trim(coalesce(i.email,''))='' or lower(trim(i.email))<>lower(trim(e.email))
 then raise exception 'El correo no coincide con el expediente'; end if;
 insert into public.inv_portal_links(company_id,user_id,investor_id,created_by)
 values(e.company_id,e.user_id,i.id,auth.uid());
 update public.inv_portal_enrollments set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now()
 where id=e.id;
 insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
 values(e.company_id,i.id,'PORTAL_ACCESS_APPROVED',jsonb_build_object('enrollment_id',e.id,'user_id',e.user_id),auth.uid());
end $$;

create function public.inv_portal_reject_enrollment(p_enrollment uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare e public.inv_portal_enrollments%rowtype;
begin
 select * into e from public.inv_portal_enrollments where id=p_enrollment for update;
 if not found or e.status<>'PENDING' then raise exception 'Registro no pendiente'; end if;
 if not public.inv_company_can_review(e.company_id) then raise exception 'Acceso denegado'; end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 then raise exception 'Motivo obligatorio (3 a 1000 caracteres)'; end if;
 update public.inv_portal_enrollments set status='REJECTED',decision_notes=trim(p_reason),
 reviewed_by=auth.uid(),reviewed_at=now() where id=e.id;
 insert into public.inv_audit_log(company_id,action,detail,created_by)
 values(e.company_id,'PORTAL_ACCESS_REJECTED',jsonb_build_object('enrollment_id',e.id),auth.uid());
end $$;

-- Investor requests use existing inv_applications (no duplicate approvals or accounts).
create function public.inv_portal_submit_application(
 p_company uuid,p_amount numeric,p_months integer,p_start date,
 p_method text,p_place text,p_notes text default ''
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_investor uuid;v_id uuid;
begin
 select l.investor_id into v_investor from public.inv_portal_links l
 join public.inv_investors i on i.id=l.investor_id and i.company_id=l.company_id
 join public.inv_portal_enrollments e on e.user_id=l.user_id and e.company_id=l.company_id and e.status='APPROVED'
 where l.user_id=auth.uid() and l.company_id=p_company and i.status='ACTIVE';
 if v_investor is null then raise exception 'Cuenta no aprobada'; end if;
 if not exists(select 1 from public.saas_company_subscriptions s join public.saas_verticals v on v.id=s.vertical_id
  where s.company_id=p_company and v.code='FINANCIAL_INVESTORS'
  and (s.status in ('active','trial') or (s.status='past_due' and s.grace_ends_at>now())))
 then raise exception 'Empresa no disponible'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_months is null or p_months not between 1 and 60
 then raise exception 'Monto o plazo inválido'; end if;
 if p_start is null or p_start<(now() at time zone 'America/El_Salvador')::date then raise exception 'Fecha prevista inválida'; end if;
 if length(trim(coalesce(p_method,'')))<3 or length(p_method)>80
  or length(coalesce(p_place,''))>120 or length(coalesce(p_notes,''))>1000 then raise exception 'Campos inválidos'; end if;
 insert into public.inv_applications(company_id,investor_id,requested_amount,requested_term_months,requested_start_date,
 payment_method,payment_place,observations,created_by,status)
 values(p_company,v_investor,p_amount,p_months,p_start,trim(p_method),trim(coalesce(p_place,'')),
 trim(coalesce(p_notes,'')),auth.uid(),'PENDING') returning id into v_id;
 insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
 values(p_company,v_investor,'PORTAL_APPLICATION_SUBMITTED',jsonb_build_object('application_id',v_id),auth.uid());
 return v_id;
end $$;

-- Withdrawal REQUESTS only: no payment, credit, or ledger mutation.
create function public.inv_portal_submit_withdrawal(
 p_company uuid,p_investment uuid,p_type text,p_amount numeric,p_method text,p_notes text default ''
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_investor uuid;v_id uuid;v_balance numeric;
begin
 select l.investor_id into v_investor from public.inv_portal_links l
 join public.inv_investors i on i.id=l.investor_id and i.company_id=l.company_id
 join public.inv_portal_enrollments e on e.user_id=l.user_id and e.company_id=l.company_id and e.status='APPROVED'
 where l.user_id=auth.uid() and l.company_id=p_company and i.status='ACTIVE';
 if v_investor is null then raise exception 'Cuenta no aprobada'; end if;
 if not exists(select 1 from public.saas_company_subscriptions s join public.saas_verticals v on v.id=s.vertical_id
  where s.company_id=p_company and v.code='FINANCIAL_INVESTORS'
  and (s.status in ('active','trial') or (s.status='past_due' and s.grace_ends_at>now())))
 then raise exception 'Empresa no disponible'; end if;
 if not exists(select 1 from public.inv_investments
 where id=p_investment and company_id=p_company and investor_id=v_investor and status in ('ACTIVE','MATURING','MATURED'))
 then raise exception 'La inversión seleccionada no está disponible'; end if;
 if p_type not in ('YIELD','CAPITAL_RETURN') or p_amount is null or p_amount<=0 or p_amount>999999999999.99
 then raise exception 'Tipo o monto inválido'; end if;
 if length(trim(coalesce(p_method,'')))<3 or length(p_method)>80 or length(coalesce(p_notes,''))>1000
 then raise exception 'Campos inválidos'; end if;
 if p_type='CAPITAL_RETURN' then
  select inv.principal-coalesce((select sum(p.amount) from public.inv_payments p
   where p.investment_id=inv.id and p.payment_type='CAPITAL_RETURN' and p.status='POSTED'),0)
  into v_balance from public.inv_investments inv where inv.id=p_investment;
  if p_amount>v_balance then raise exception 'Monto mayor al capital pendiente'; end if;
 end if;
 insert into public.inv_portal_withdrawals(company_id,investor_id,investment_id,payment_type,amount,payment_method,notes)
 values(p_company,v_investor,p_investment,p_type,p_amount,trim(p_method),trim(coalesce(p_notes,'')))
 returning id into v_id;
 insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
 values(p_company,v_investor,p_investment,'PORTAL_WITHDRAWAL_REQUESTED',jsonb_build_object('request_id',v_id,'amount',p_amount,'type',p_type),auth.uid());
 return v_id;
end $$;

-- Every financial completion references a payment already posted in existing inv_payments.
create function public.inv_portal_review_withdrawal(p_request uuid,p_status text,p_note text default '',p_payment uuid default null)
returns void language plpgsql security definer set search_path=''
as $$
declare r public.inv_portal_withdrawals%rowtype;
begin
 select * into r from public.inv_portal_withdrawals where id=p_request for update;
 if not found then raise exception 'Solicitud no encontrada'; end if;
 if not public.inv_company_can_review(r.company_id) then raise exception 'Acceso denegado'; end if;
 if length(coalesce(p_note,''))>1000 then raise exception 'Motivo demasiado largo'; end if;
 if not (
  (r.status='PENDING' and p_status in ('REVIEW','REJECTED')) or
  (r.status='REVIEW' and p_status in ('APPROVED','REJECTED')) or
  (r.status='APPROVED' and p_status='COMPLETED')
 ) then raise exception 'Transición no permitida'; end if;
 if p_status='REJECTED' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Motivo del rechazo obligatorio'; end if;
 if p_status='COMPLETED' and not exists(
  select 1 from public.inv_payments p where p.id=p_payment and p.company_id=r.company_id
  and p.investor_id=r.investor_id and p.investment_id=r.investment_id
  and p.payment_type=r.payment_type and p.amount=r.amount and p.status='POSTED')
 then raise exception 'Debe seleccionar un pago ya asentado y coincidente'; end if;
 update public.inv_portal_withdrawals set status=p_status,decision_notes=trim(coalesce(p_note,'')),
 reviewed_at=now(),reviewed_by=auth.uid(),
 payment_id=case when p_status='COMPLETED' then p_payment else payment_id end
 where id=r.id;
 insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
 values(r.company_id,r.investor_id,r.investment_id,'PORTAL_WITHDRAWAL_'||p_status,jsonb_build_object('request_id',r.id,'payment_id',p_payment,'from',r.status,'to',p_status),auth.uid());
end $;

revoke all on function public.inv_portal_link_account(uuid,uuid),
 public.inv_portal_reject_enrollment(uuid,text),
 public.inv_portal_submit_application(uuid,numeric,integer,date,text,text,text),
 public.inv_portal_submit_withdrawal(uuid,uuid,text,numeric,text,text),
 public.inv_portal_review_withdrawal(uuid,text,text,uuid) from public,anon;
grant execute on function public.inv_portal_link_account(uuid,uuid),
 public.inv_portal_reject_enrollment(uuid,text),
 public.inv_portal_submit_application(uuid,numeric,integer,date,text,text,text),
 public.inv_portal_submit_withdrawal(uuid,uuid,text,numeric,text,text),
 public.inv_portal_review_withdrawal(uuid,text,text,uuid) to authenticated;
