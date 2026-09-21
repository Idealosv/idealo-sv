-- PRESTADITO$ / IDEALO SV
-- Administración controlada de datos operativos de una inversión formalizada.

create or replace function public.inv_update_investment_details(
  p_investment_id uuid,
  p_contract_number text default '',
  p_projected_gain numeric default null,
  p_payment_place text default '',
  p_payment_method text default '',
  p_notes text default ''
)
returns public.inv_investments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_current public.inv_investments%rowtype;
  v_result public.inv_investments%rowtype;
begin
  select * into v_current
  from public.inv_investments
  where id=p_investment_id
  for update;

  if not found then
    raise exception 'Inversión no encontrada.';
  end if;

  if not public.inv_company_can_review(v_current.company_id) then
    raise exception 'Solo propietario o administrador puede modificar una inversión.';
  end if;

  if p_projected_gain is not null and p_projected_gain<0 then
    raise exception 'La ganancia proyectada no puede ser negativa.';
  end if;

  update public.inv_investments
  set
    contract_number=coalesce(trim(p_contract_number),''),
    projected_gain=p_projected_gain,
    payment_place=coalesce(trim(p_payment_place),''),
    payment_method=coalesce(trim(p_payment_method),''),
    updated_at=now()
  where id=p_investment_id
  returning * into v_result;

  insert into public.inv_audit_log(
    company_id,investor_id,investment_id,action,detail,created_by
  )
  values(
    v_current.company_id,v_current.investor_id,v_current.id,'INVESTMENT_DETAILS_UPDATED',
    jsonb_build_object(
      'contract_number_from',v_current.contract_number,
      'contract_number_to',v_result.contract_number,
      'projected_gain_from',v_current.projected_gain,
      'projected_gain_to',v_result.projected_gain,
      'payment_place_from',v_current.payment_place,
      'payment_place_to',v_result.payment_place,
      'payment_method_from',v_current.payment_method,
      'payment_method_to',v_result.payment_method,
      'note',coalesce(trim(p_notes),'')
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.inv_update_investment_details(uuid,text,numeric,text,text,text) from public;
grant execute on function public.inv_update_investment_details(uuid,text,numeric,text,text,text) to authenticated,service_role;
