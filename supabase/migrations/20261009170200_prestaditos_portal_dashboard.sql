-- Read-only, single-investor snapshot from the REAL ERP tables.
create function public.inv_portal_dashboard(p_company uuid)
returns jsonb language plpgsql security definer stable set search_path=''
as $$
declare v_investor uuid;v_data jsonb;
begin
 select l.investor_id into v_investor from public.inv_portal_links l
 join public.inv_investors i on i.id=l.investor_id and i.company_id=l.company_id and i.status='ACTIVE'
 join public.inv_portal_enrollments e on e.company_id=l.company_id and e.user_id=l.user_id
 where l.company_id=p_company and l.user_id=auth.uid() and e.status='APPROVED';
 if v_investor is null then raise exception 'Cuenta no aprobada'; end if;
 if not exists(
 select 1 from public.saas_company_subscriptions s
 join public.saas_verticals v on v.id=s.vertical_id
 where s.company_id=p_company and v.code='FINANCIAL_INVESTORS'
 and (s.status in ('active','trial') or (s.status='past_due' and s.grace_ends_at>now()))
 ) then raise exception 'Empresa no disponible'; end if;

 select jsonb_build_object(
  'investor',jsonb_build_object('id',i.id,'name',concat_ws(' ',i.first_names,i.last_names),'investor_code',i.investor_code,'status',i.status),
  'investments',coalesce((
    select jsonb_agg(jsonb_build_object('id',x.id,'code',x.investment_code,
     'principal',x.principal,'rate',x.agreed_return_rate,'status',x.status,
     'granted_at',x.granted_at,'maturity_date',x.maturity_date,'term_months',x.term_months) order by x.granted_at desc)
    from public.inv_investments x where x.investor_id=i.id and x.company_id=p_company
  ),'[]'::jsonb),
  'applications',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'code',a.application_code,'amount',a.requested_amount,
    'status',a.status,'months',a.requested_term_months,'created_at',a.created_at,
    'approved_amount',a.approved_amount,'decision_notes',a.decision_notes) order by a.created_at desc)
    from public.inv_applications a where a.investor_id=i.id and a.company_id=p_company
  ),'[]'::jsonb),
  'payments',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'code',p.payment_code,'amount',p.amount,
    'type',p.payment_type,'date',p.payment_date,'status',p.status,
    'investment_id',p.investment_id) order by p.payment_date desc)
    from public.inv_payments p where p.investor_id=i.id and p.company_id=p_company
  ),'[]'::jsonb),
  'withdrawals',coalesce((
    select jsonb_agg(jsonb_build_object('id',w.id,'amount',w.amount,'type',w.payment_type,
    'status',case when w.status='COMPLETED' and exists(
      select 1 from public.inv_payments p where p.id=w.payment_id and p.status='REVERSED'
     ) then 'PAYMENT_REVERSED' else w.status end,'investment_id',w.investment_id,'created_at',w.created_at,
    'decision_notes',w.decision_notes) order by w.created_at desc)
    from public.inv_portal_withdrawals w where w.investor_id=i.id and w.company_id=p_company
  ),'[]'::jsonb)
 ) into v_data from public.inv_investors i where i.id=v_investor and i.company_id=p_company;
 if v_data is null then raise exception 'Expediente no encontrado'; end if;
 return v_data;
end $$;
revoke all on function public.inv_portal_dashboard(uuid) from public,anon;
grant execute on function public.inv_portal_dashboard(uuid) to authenticated;
