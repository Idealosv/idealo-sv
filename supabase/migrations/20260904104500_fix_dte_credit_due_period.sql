-- Corrige el vencimiento de CxC generado desde DTE: usa periodo + unidad (días/meses/años).
create or replace function public.post_processed_dte_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer, 1);
  v_total numeric := coalesce((new.dte_payload->'resumen'->>'totalPagar')::numeric, (new.dte_payload->'resumen'->>'montoTotalOperacion')::numeric, 0);
  v_payment_code text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'codigo', '01');
  v_period integer := coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'periodo')::integer, 0), 30);
  v_term text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'plazo', '01');
  v_account_id uuid;
  v_account_type text;
  v_account_name text;
  v_due date;
  v_receivable_number bigint;
begin
  if new.environment <> 'production' or new.status <> 'PROCESSED' or old.status = 'PROCESSED' then
    return new;
  end if;
  if v_total <= 0 then return new; end if;

  if v_condition = 2 then
    v_due := case v_term
      when '02' then (current_date + make_interval(months => v_period))::date
      when '03' then (current_date + make_interval(years => v_period))::date
      else current_date + v_period
    end;

    select coalesce(max(number), 0) + 1 into v_receivable_number
    from public.accounts_receivable
    where company_id = new.company_id;

    insert into public.accounts_receivable(
      company_id, client_id, number, concept, amount_total, amount_paid, due_date, status, dte_document_id
    ) values (
      new.company_id, new.client_id, v_receivable_number,
      'DTE ' || new.control_number,
      v_total, 0, v_due, 'OPEN', new.id
    )
    on conflict (dte_document_id) where dte_document_id is not null do nothing;
    return new;
  end if;

  v_account_type := case when v_payment_code = '01' then 'CASH' else 'BANK' end;
  v_account_name := case when v_account_type = 'CASH' then 'Caja principal' else 'Banco principal' end;

  insert into public.cash_accounts(company_id, name, account_type, opening_balance, active)
  values (new.company_id, v_account_name, v_account_type, 0, true)
  on conflict (company_id, name) do update set active = true
  returning id into v_account_id;

  insert into public.cash_movements(
    company_id, cash_account_id, movement_date, movement_type, source_type, source_id, concept, amount, reference, notes
  ) values (
    new.company_id, v_account_id, now(), 'INCOME', 'CUSTOMER_PAYMENT', new.id,
    'Cobro DTE ' || new.control_number,
    v_total,
    new.dte_payload->'resumen'->'pagos'->0->>'referencia',
    'Ingreso generado automáticamente después de aceptación de Hacienda.'
  )
  on conflict (source_type, source_id) where source_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.post_processed_dte_financials() from public, anon, authenticated;
grant execute on function public.post_processed_dte_financials() to service_role;
