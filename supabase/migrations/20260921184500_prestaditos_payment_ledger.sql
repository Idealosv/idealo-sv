-- PRESTADITO$ / IDEALO SV
-- Libro controlado de pagos a inversionistas: sin borrados, con reversión auditada.

alter table public.inv_payments
  add column if not exists payment_code text,
  add column if not exists status text not null default 'POSTED',
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid,
  add column if not exists reversal_reason text not null default '';

update public.inv_payments
set payment_code=
  'PAG-' || to_char(created_at at time zone 'America/El_Salvador','YYYYMMDD') || '-' ||
  upper(substr(replace(id::text,'-',''),1,6))
where coalesce(trim(payment_code),'')='';

create unique index if not exists inv_payments_company_code_uidx
  on public.inv_payments(company_id,payment_code);

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='inv_payments_status_check'
      and conrelid='public.inv_payments'::regclass
  ) then
    alter table public.inv_payments
      add constraint inv_payments_status_check
      check(status in ('POSTED','REVERSED'));
  end if;
end $$;

create or replace function public.inv_record_payment(
  p_investment_id uuid,
  p_payment_type text,
  p_amount numeric,
  p_payment_date date,
  p_payment_place text default '',
  p_payment_method text default '',
  p_reference text default '',
  p_notes text default ''
)
returns public.inv_payments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_investment public.inv_investments%rowtype;
  v_id uuid;
  v_code text;
  v_type text;
  v_returned numeric;
  v_result public.inv_payments%rowtype;
begin
  select * into v_investment
  from public.inv_investments
  where id=p_investment_id
  for update;

  if not found then
    raise exception 'Inversión no encontrada.';
  end if;

  if not public.inv_company_can_review(v_investment.company_id) then
    raise exception 'Solo propietario o administrador puede registrar pagos.';
  end if;

  v_type:=upper(trim(coalesce(p_payment_type,'')));
  if v_type not in ('YIELD','CAPITAL_RETURN','ADJUSTMENT') then
    raise exception 'Tipo de pago no permitido.';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'El monto del pago debe ser mayor que cero.';
  end if;

  if p_payment_date is null then
    raise exception 'La fecha del pago es obligatoria.';
  end if;

  if p_payment_date<v_investment.granted_at then
    raise exception 'El pago no puede ser anterior a la fecha de otorgamiento.';
  end if;

  if v_investment.status='CANCELLED' then
    raise exception 'No se pueden registrar pagos sobre una inversión cancelada.';
  end if;

  if v_type='CAPITAL_RETURN' then
    select coalesce(sum(amount),0)
      into v_returned
    from public.inv_payments
    where investment_id=v_investment.id
      and payment_type='CAPITAL_RETURN'
      and status='POSTED';

    if v_returned+p_amount>v_investment.principal then
      raise exception 'La devolución de capital supera el capital pendiente.';
    end if;
  end if;

  v_id:=gen_random_uuid();
  v_code:='PAG-'||to_char(p_payment_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

  insert into public.inv_payments(
    id,company_id,investor_id,investment_id,payment_code,payment_type,amount,
    payment_date,payment_place,payment_method,reference,notes,status,created_by
  )
  values(
    v_id,v_investment.company_id,v_investment.investor_id,v_investment.id,v_code,v_type,p_amount,
    p_payment_date,coalesce(trim(p_payment_place),''),
    coalesce(trim(p_payment_method),''),
    coalesce(trim(p_reference),''),
    coalesce(trim(p_notes),''),
    'POSTED',auth.uid()
  )
  returning * into v_result;

  insert into public.inv_audit_log(
    company_id,investor_id,investment_id,action,detail,created_by
  )
  values(
    v_investment.company_id,v_investment.investor_id,v_investment.id,'INVESTOR_PAYMENT_RECORDED',
    jsonb_build_object(
      'payment_id',v_result.id,
      'payment_code',v_result.payment_code,
      'payment_type',v_result.payment_type,
      'amount',v_result.amount,
      'payment_date',v_result.payment_date,
      'reference',v_result.reference
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

create or replace function public.inv_reverse_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.inv_payments
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_payment public.inv_payments%rowtype;
  v_result public.inv_payments%rowtype;
begin
  select * into v_payment
  from public.inv_payments
  where id=p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if not public.inv_company_can_review(v_payment.company_id) then
    raise exception 'Solo propietario o administrador puede revertir pagos.';
  end if;

  if v_payment.status='REVERSED' then
    raise exception 'El pago ya está revertido.';
  end if;

  if coalesce(trim(p_reason),'')='' then
    raise exception 'Indicá el motivo de la reversión.';
  end if;

  update public.inv_payments
  set
    status='REVERSED',
    reversed_at=now(),
    reversed_by=auth.uid(),
    reversal_reason=trim(p_reason)
  where id=p_payment_id
  returning * into v_result;

  insert into public.inv_audit_log(
    company_id,investor_id,investment_id,action,detail,created_by
  )
  values(
    v_payment.company_id,v_payment.investor_id,v_payment.investment_id,'INVESTOR_PAYMENT_REVERSED',
    jsonb_build_object(
      'payment_id',v_payment.id,
      'payment_code',v_payment.payment_code,
      'payment_type',v_payment.payment_type,
      'amount',v_payment.amount,
      'reason',trim(p_reason)
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.inv_record_payment(uuid,text,numeric,date,text,text,text,text) from public;
revoke all on function public.inv_reverse_payment(uuid,text) from public;
grant execute on function public.inv_record_payment(uuid,text,numeric,date,text,text,text,text) to authenticated,service_role;
grant execute on function public.inv_reverse_payment(uuid,text) to authenticated,service_role;

revoke insert,update,delete on public.inv_payments from authenticated;
drop policy if exists inv_member_insert on public.inv_payments;
drop policy if exists inv_member_update on public.inv_payments;
drop policy if exists inv_member_delete on public.inv_payments;
