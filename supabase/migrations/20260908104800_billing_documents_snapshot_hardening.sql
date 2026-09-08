-- Completa el snapshot de Facturación para que Resumen y Documentos no dependan de listas truncadas.
create or replace function public.billing_control_snapshot(p_company uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_read(p_company) then raise exception 'Sin permiso para consultar Facturación'; end if;
  select jsonb_build_object(
    'total',count(*),
    'draft',count(*) filter(where d.status='DRAFT'),
    'signing',count(*) filter(where d.status='SIGNING'),
    'signed',count(*) filter(where d.status='SIGNED'),
    'transmitting',count(*) filter(where d.status='TRANSMITTING'),
    'accepted',count(*) filter(where d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null),
    'processed',count(*) filter(where d.status='PROCESSED'),
    'rejected',count(*) filter(where d.status='REJECTED'),
    'invalidated',count(*) filter(where d.status='INVALIDATED'),
    'test',count(*) filter(where lower(coalesce(d.environment,'')) in ('test','00')),
    'production',count(*) filter(where lower(coalesce(d.environment,'')) in ('production','01')),
    'withSeal',count(*) filter(where nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null),
    'critical',count(*) filter(where
      (d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is null)
      or (d.status<>'PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null)
      or nullif(trim(coalesce(d.control_number,'')),'') is null
      or d.generation_code is null),
    'amountAccepted',coalesce(sum(case when d.status='PROCESSED' and nullif(trim(coalesce(d.mh_receipt_seal,'')),'') is not null
      then coalesce((d.dte_payload->'resumen'->>'totalPagar')::numeric,(d.dte_payload->'resumen'->>'montoTotalOperacion')::numeric,0) else 0 end),0)
  ) into result
  from public.dte_documents d where d.company_id=p_company;
  return result;
end $$;
revoke all on function public.billing_control_snapshot(uuid) from public,anon;
grant execute on function public.billing_control_snapshot(uuid) to authenticated;
