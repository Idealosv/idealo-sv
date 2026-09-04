-- IDEALO SV: enlaza automáticamente el DTE con la cotización/OT usada al facturar.
-- Esto permite aplicar anticipos recibidos antes de emitir el DTE final sin duplicar Caja.

create or replace function public.link_dte_source_from_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text;
  v_quote_token text;
  v_quote_prefix text;
  v_quote_number bigint;
  v_work_order_number bigint;
  v_quote_id uuid;
  v_work_order_id uuid;
begin
  if new.source_quote_id is not null and new.source_work_order_id is not null then
    return new;
  end if;

  v_reference := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'referencia', '');
  if btrim(v_reference) = '' then
    return new;
  end if;

  -- Referencia generada por Facturación: "Cotización COT-6 / OT-2".
  v_quote_token := substring(v_reference from '(?i)cotizaci[oó]n\s+([A-Za-z0-9_]+-[0-9]+)');
  if v_quote_token is not null then
    v_quote_prefix := upper(split_part(v_quote_token, '-', 1));
    begin
      v_quote_number := split_part(v_quote_token, '-', 2)::bigint;
    exception when others then
      v_quote_number := null;
    end;
  end if;

  if new.source_quote_id is null and v_quote_number is not null then
    select q.id into v_quote_id
    from public.quotes q
    where q.company_id = new.company_id
      and q.number = v_quote_number
      and upper(coalesce(q.prefix, 'COT')) = v_quote_prefix
    order by q.created_at desc
    limit 1;
    new.source_quote_id := v_quote_id;
  else
    v_quote_id := new.source_quote_id;
  end if;

  begin
    v_work_order_number := substring(v_reference from '(?i)OT-([0-9]+)')::bigint;
  exception when others then
    v_work_order_number := null;
  end;

  if new.source_work_order_id is null and v_work_order_number is not null then
    select w.id into v_work_order_id
    from public.work_orders w
    where w.company_id = new.company_id
      and w.number = v_work_order_number
      and (coalesce(v_quote_id, new.source_quote_id) is null or w.quote_id = coalesce(v_quote_id, new.source_quote_id))
    order by w.created_at desc
    limit 1;
    new.source_work_order_id := v_work_order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_link_dte_source_from_reference on public.dte_documents;
create trigger trg_link_dte_source_from_reference
before insert or update of dte_payload, source_quote_id, source_work_order_id
on public.dte_documents
for each row execute function public.link_dte_source_from_reference();

-- Backfill seguro para borradores/firmados/rechazados existentes. No toca DTE PROCESSED.
update public.dte_documents d
set dte_payload = d.dte_payload
where d.status <> 'PROCESSED'
  and (d.source_quote_id is null or d.source_work_order_id is null)
  and coalesce(d.dte_payload->'resumen'->'pagos'->0->>'referencia', '') <> '';

comment on function public.link_dte_source_from_reference() is
  'Vincula un DTE a su cotización y orden de trabajo a partir de la referencia generada por Facturación para aplicar anticipos correctamente.';
