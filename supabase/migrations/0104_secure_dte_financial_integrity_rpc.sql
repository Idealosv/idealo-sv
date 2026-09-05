create or replace function public.audit_dte_financial_integrity(p_company uuid)
returns table(severity text, code text, affected bigint, detail text)
language plpgsql
security definer
set search_path=public
set row_security=off
as $$
begin
  if not public.erp_can_read_finance(p_company) then raise exception 'Tu rol no tiene acceso a la auditoría financiera'; end if;

  return query
  select 'ERROR','TEST_REAL_RECEIVABLE',count(*)::bigint,'DTE TEST aceptados que generaron CxC real; deben ser cero.'
  from public.accounts_receivable ar join public.dte_documents d on d.id=ar.dte_document_id
  where d.company_id=p_company and d.environment='test';

  return query
  select 'ERROR','TEST_REAL_CASH',count(*)::bigint,'DTE TEST con movimientos reales de Caja/Banco; deben ser cero.'
  from public.cash_movements m join public.dte_documents d on d.id=m.source_id
  where d.company_id=p_company and d.environment='test' and m.source_type in ('CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL');

  return query
  select 'ERROR','CREDIT_WITHOUT_RECEIVABLE',count(*)::bigint,'DTE producción aceptados al crédito sin cuenta por cobrar.'
  from public.dte_documents d
  where d.company_id=p_company and d.environment='production' and d.status='PROCESSED'
    and coalesce((d.dte_payload#>>'{resumen,condicionOperacion}')::integer,1)=2
    and not exists(select 1 from public.accounts_receivable ar where ar.dte_document_id=d.id);

  return query
  select 'ERROR','CASH_WITHOUT_COLLECTION',count(*)::bigint,'DTE producción al contado con saldo no cubierto por anticipos y sin cobro real en Caja/Banco.'
  from public.dte_documents d
  where d.company_id=p_company and d.environment='production' and d.status='PROCESSED'
    and coalesce((d.dte_payload#>>'{resumen,condicionOperacion}')::integer,1)<>2
    and coalesce((d.dte_payload#>>'{resumen,totalPagar}')::numeric,(d.dte_payload#>>'{resumen,montoTotalOperacion}')::numeric,0)
      > coalesce((select sum(a.amount) from public.customer_advance_applications a where a.dte_document_id=d.id),0)+0.001
    and not exists(select 1 from public.cash_movements m where m.company_id=d.company_id and m.source_type='CUSTOMER_PAYMENT' and m.source_id=d.id);

  return query
  select 'ERROR','RECEIVABLE_BALANCE_MISMATCH',count(*)::bigint,'CxC cuyo amount_paid no coincide con cobros no revertidos.'
  from public.accounts_receivable ar
  where ar.company_id=p_company and abs(coalesce(ar.amount_paid,0)-coalesce((select sum(p.amount) from public.customer_payments p where p.receivable_id=ar.id and not exists(select 1 from public.customer_payment_reversals r where r.payment_id=p.id)),0))>0.01;

  return query
  select 'ERROR','ADVANCE_OVERAPPLIED',count(*)::bigint,'Anticipos con monto aplicado mayor al recibido.'
  from public.customer_advances a where a.company_id=p_company and coalesce(a.applied_amount,0)>a.amount+0.001;

  return query
  select 'ERROR','INVALIDATED_WITH_LIVE_FINANCE',count(*)::bigint,'DTE invalidados que aún conservan cobros o CxC activas.'
  from public.dte_documents d
  where d.company_id=p_company and d.status='INVALIDATED' and d.environment='production' and (
    exists(select 1 from public.accounts_receivable ar where ar.dte_document_id=d.id and ar.status<>'CANCELLED') or
    (exists(select 1 from public.cash_movements m where m.company_id=d.company_id and m.source_type='CUSTOMER_PAYMENT' and m.source_id=d.id)
      and not exists(select 1 from public.cash_movements r where r.company_id=d.company_id and r.source_type='CUSTOMER_PAYMENT_REVERSAL' and r.source_id=d.id))
  );

  return query
  select 'WARN','REISSUE_WITHOUT_SOURCE',count(*)::bigint,'DTE posteriores a un rechazo que no declaran reissued_from_id; revisar solo cuando realmente sean reemisiones.'
  from public.dte_documents d where d.company_id=p_company and d.reissued_from_id is null and d.status in ('DRAFT','SIGNED','SENT','PROCESSED')
    and exists(select 1 from public.dte_documents old where old.company_id=d.company_id and old.status='REJECTED' and old.control_number<>d.control_number and old.created_at<d.created_at and old.client_id is not distinct from d.client_id);

  return query
  select 'INFO','PRODUCTION_PROCESSED',count(*)::bigint,'DTE de producción aceptados incluidos en Finanzas.'
  from public.dte_documents d where d.company_id=p_company and d.environment='production' and d.status='PROCESSED';
end;
$$;
revoke all on function public.audit_dte_financial_integrity(uuid) from public,anon;
grant execute on function public.audit_dte_financial_integrity(uuid) to authenticated;
