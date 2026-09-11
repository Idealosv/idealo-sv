-- IDEALO BAR: apertura de caja idempotente.
-- Mantiene el índice único de integridad, pero si la caja ya está abierta
-- devuelve la sesión existente en lugar de exponer un unique_violation.

create or replace function public.open_cash_register(
  p_company uuid,
  p_cash_account uuid,
  p_opening_balance numeric,
  p_business_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.cash_accounts%rowtype;
  v_id uuid;
begin
  select *
    into a
  from public.cash_accounts
  where id = p_cash_account
    and company_id = p_company
    and active = true
    and upper(account_type) <> 'BANK'
  for update;

  if not found then
    raise exception 'Caja no disponible';
  end if;

  if not (public.erp_can_admin(p_company) or public.bar_has_permission(p_company,'cash.open')) then
    raise exception 'Tu rol no puede abrir caja';
  end if;

  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'Efectivo inicial inválido';
  end if;

  -- Una segunda pulsación o una pantalla desactualizada reutiliza la sesión.
  select id
    into v_id
  from public.cash_register_sessions
  where company_id = p_company
    and cash_account_id = p_cash_account
    and status = 'OPEN'
  order by opened_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.cash_register_sessions(
      company_id,
      cash_account_id,
      business_date,
      opening_balance,
      opened_by
    ) values (
      p_company,
      p_cash_account,
      coalesce(p_business_date,current_date),
      round(p_opening_balance,2),
      auth.uid()
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Protección adicional para dos solicitudes concurrentes.
      select id
        into v_id
      from public.cash_register_sessions
      where company_id = p_company
        and cash_account_id = p_cash_account
        and status = 'OPEN'
      order by opened_at desc
      limit 1;

      if v_id is null then
        raise;
      end if;
  end;

  return v_id;
end;
$function$;
