-- Allow a cash-register shift to start with the physically counted amount,
-- independently from the historical ledger balance of the cash account.
-- This keeps the opening amount useful for real-world cash reconciliation.

create or replace function public.enforce_cash_register_session_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.cash_accounts%rowtype;
  v_in numeric;
  v_out numeric;
  v_expected numeric;
begin
  if tg_op='INSERT' then
    select * into a
    from public.cash_accounts
    where id=new.cash_account_id
      and company_id=new.company_id
      and active=true
      and upper(account_type)<>'BANK'
    for update;

    if not found then
      raise exception 'Caja no disponible';
    end if;

    if not public.erp_can_admin(new.company_id) then
      raise exception 'Solo propietario o administrador puede abrir caja';
    end if;

    if new.status<>'OPEN' then
      raise exception 'Un turno nuevo debe iniciar abierto';
    end if;

    if new.opening_balance is null or new.opening_balance<0 then
      raise exception 'Efectivo inicial inválido';
    end if;

    new.opening_balance:=round(new.opening_balance,2);
    new.opened_by:=auth.uid();
    return new;
  end if;

  if old.status='CLOSED' then
    if new is distinct from old then
      raise exception 'Un turno cerrado no puede modificarse';
    end if;
    return new;
  end if;

  if not public.erp_can_admin(old.company_id) then
    raise exception 'Solo propietario o administrador puede modificar caja';
  end if;

  if new.company_id is distinct from old.company_id
     or new.cash_account_id is distinct from old.cash_account_id
     or new.opening_balance is distinct from old.opening_balance
     or new.business_date is distinct from old.business_date then
    raise exception 'No se puede alterar empresa, caja, fecha o apertura de un turno iniciado';
  end if;

  if new.status='CLOSED' and old.status='OPEN' then
    if new.closing_counted is null or new.closing_counted<0 then
      raise exception 'Efectivo contado inválido';
    end if;

    select
      coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),
      coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0)
    into v_in,v_out
    from public.cash_movements
    where company_id=old.company_id
      and cash_register_session_id=old.id;

    v_expected:=round(old.opening_balance+v_in-v_out,2);
    new.closing_expected:=v_expected;
    new.closing_counted:=round(new.closing_counted,2);
    new.difference:=round(new.closing_counted-v_expected,2);
    new.closed_at:=coalesce(new.closed_at,now());
    new.closed_by:=auth.uid();
  elsif new.status<>old.status then
    raise exception 'Cambio de estado de caja no permitido';
  end if;

  return new;
end;
$$;

create or replace function public.open_cash_register(
  p_company uuid,
  p_cash_account uuid,
  p_opening_balance numeric,
  p_business_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.cash_accounts%rowtype;
  v_id uuid;
begin
  select * into a
  from public.cash_accounts
  where id=p_cash_account
    and company_id=p_company
    and active=true
    and upper(account_type)<>'BANK'
  for update;

  if not found then
    raise exception 'Caja no disponible';
  end if;

  if not public.erp_can_admin(p_company) then
    raise exception 'Solo propietario o administrador puede abrir caja';
  end if;

  if p_opening_balance is null or p_opening_balance<0 then
    raise exception 'Efectivo inicial inválido';
  end if;

  insert into public.cash_register_sessions(
    company_id,
    cash_account_id,
    business_date,
    opening_balance,
    opened_by
  )
  values(
    p_company,
    p_cash_account,
    coalesce(p_business_date,current_date),
    round(p_opening_balance,2),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;
