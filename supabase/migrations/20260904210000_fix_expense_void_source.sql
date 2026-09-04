create or replace function public.reverse_voided_business_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.cash_movements%rowtype;
  v_reversal_id uuid;
begin
  if old.status = 'VOIDED' then
    if new.status <> old.status then
      raise exception 'Un gasto anulado no puede reactivarse. Registra un gasto nuevo si corresponde.';
    end if;
    return new;
  end if;

  if new.status = 'VOIDED' and old.status <> 'VOIDED' then
    if nullif(btrim(coalesce(new.void_reason,'')), '') is null then
      raise exception 'Debes indicar el motivo de la anulación.';
    end if;

    new.voided_at := coalesce(new.voided_at, now());

    select * into v_original
    from public.cash_movements
    where company_id = old.company_id
      and source_type = 'EXPENSE'
      and source_id = old.id
      and movement_type = 'EXPENSE'
    order by created_at desc
    limit 1;

    if v_original.id is not null then
      insert into public.cash_movements(
        company_id,cash_account_id,movement_date,movement_type,
        source_type,source_id,concept,amount,reference,notes
      ) values (
        old.company_id,
        v_original.cash_account_id,
        now(),
        'INCOME',
        'OTHER',
        gen_random_uuid(),
        'Anulación de gasto: ' || old.concept,
        old.amount,
        coalesce(old.reference,'') || case when old.reference is null or old.reference='' then '' else ' · ' end || 'Gasto ' || old.id::text,
        'REVERSIÓN DE GASTO · Motivo: ' || new.void_reason
      ) returning id into v_reversal_id;

      new.void_reversal_id := v_reversal_id;
    end if;
  end if;

  return new;
end;
$$;
