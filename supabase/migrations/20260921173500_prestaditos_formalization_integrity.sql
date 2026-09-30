-- PRESTADITO$ / IDEALO SV
-- Formalización atómica: una solicitud recibida en fondos genera una sola inversión.

create unique index if not exists inv_investments_application_uidx
  on public.inv_investments(application_id)
  where application_id is not null;

create or replace function public.inv_formalize_application(
  p_application_id uuid,
  p_granted_at date,
  p_contract_number text default '',
  p_projected_gain numeric default null,
  p_payment_place text default '',
  p_payment_method text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_app public.inv_applications%rowtype;
  v_id uuid;
  v_code text;
  v_principal numeric;
  v_term integer;
  v_maturity date;
  v_result public.inv_investments%rowtype;
begin
  select * into v_app
  from public.inv_applications
  where id=p_application_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  if not public.inv_company_can_review(v_app.company_id) then
    raise exception 'Solo propietario o administrador puede formalizar una inversión.';
  end if;

  if v_app.status<>'FUNDS_RECEIVED' then
    raise exception 'La solicitud debe estar en Fondos recibidos antes de formalizar.';
  end if;

  if exists(select 1 from public.inv_investments where application_id=v_app.id) then
    raise exception 'Esta solicitud ya tiene una inversión formalizada.';
  end if;

  if p_granted_at is null then
    raise exception 'La fecha de otorgamiento es obligatoria.';
  end if;

  v_principal:=coalesce(v_app.approved_amount,v_app.requested_amount);
  v_term:=coalesce(v_app.approved_term_months,v_app.requested_term_months);

  if coalesce(v_principal,0)<=0 or coalesce(v_term,0)<=0 then
    raise exception 'La solicitud no tiene monto o plazo aprobados válidos.';
  end if;

  if p_projected_gain is not null and p_projected_gain<0 then
    raise exception 'La ganancia proyectada no puede ser negativa.';
  end if;

  v_id:=gen_random_uuid();
  v_code:='INVEST-'||to_char(p_granted_at,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));
  v_maturity:=(p_granted_at + make_interval(months=>v_term))::date;

  insert into public.inv_investments(
    id,company_id,investor_id,application_id,investment_code,contract_number,
    principal,granted_at,term_months,maturity_date,projected_gain,
    payment_place,payment_method,status,created_by
  )
  values(
    v_id,v_app.company_id,v_app.investor_id,v_app.id,v_code,coalesce(trim(p_contract_number),''),
    v_principal,p_granted_at,v_term,v_maturity,p_projected_gain,
    coalesce(nullif(trim(p_payment_place),''),v_app.payment_place),
    coalesce(nullif(trim(p_payment_method),''),v_app.payment_method),
    'ACTIVE',auth.uid()
  )
  returning * into v_result;

  update public.inv_applications
  set status='ACTIVE',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where id=v_app.id;

  insert into public.inv_audit_log(
    company_id,investor_id,investment_id,action,detail,created_by
  )
  values(
    v_app.company_id,v_app.investor_id,v_result.id,'INVESTMENT_ACTIVATED',
    jsonb_build_object(
      'application_id',v_app.id,
      'application_code',v_app.application_code,
      'investment_code',v_result.investment_code,
      'principal',v_principal,
      'term_months',v_term,
      'maturity_date',v_maturity
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.inv_formalize_application(uuid,date,text,numeric,text,text) from public;
grant execute on function public.inv_formalize_application(uuid,date,text,numeric,text,text) to authenticated,service_role;

-- La creación de inversiones se hace por el RPC anterior para mantener solicitud e inversión sincronizadas.
revoke insert,delete on public.inv_investments from authenticated;
drop policy if exists inv_member_insert on public.inv_investments;
drop policy if exists inv_member_delete on public.inv_investments;
