-- Control de facturación parcial por cotización.
-- Impide que la suma de DTE activos supere el total comercial aprobado.

create or replace function public.validate_quote_partial_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_total numeric;
  v_previous numeric := 0;
  v_new_total numeric := 0;
begin
  if new.source_quote_id is null then
    return new;
  end if;

  select q.total into v_quote_total
  from public.quotes q
  where q.id = new.source_quote_id and q.company_id = new.company_id;

  if v_quote_total is null or v_quote_total <= 0 then
    return new;
  end if;

  v_new_total := coalesce(
    nullif(new.dte_payload->'resumen'->>'totalPagar','')::numeric,
    nullif(new.dte_payload->'resumen'->>'montoTotalOperacion','')::numeric,
    0
  );

  select coalesce(sum(coalesce(
    nullif(d.dte_payload->'resumen'->>'totalPagar','')::numeric,
    nullif(d.dte_payload->'resumen'->>'montoTotalOperacion','')::numeric,
    0
  )),0)
  into v_previous
  from public.dte_documents d
  where d.company_id = new.company_id
    and coalesce(d.source_quote_id,d.quote_id) = new.source_quote_id
    and d.id <> new.id
    and upper(coalesce(d.status,'')) not in ('REJECTED','VOIDED','CANCELLED','INVALIDATED');

  if round(v_previous + v_new_total,2) > round(v_quote_total,2) + 0.02 then
    raise exception 'La cotización ya tiene $% facturados. El nuevo DTE por $% supera el total aprobado de $%. Saldo máximo disponible: $%.',
      round(v_previous,2), round(v_new_total,2), round(v_quote_total,2), round(greatest(v_quote_total-v_previous,0),2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zz_validate_quote_partial_billing on public.dte_documents;
create trigger trg_zz_validate_quote_partial_billing
before insert on public.dte_documents
for each row execute function public.validate_quote_partial_billing();
