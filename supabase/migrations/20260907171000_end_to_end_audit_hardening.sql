-- IDEALO SV · Auditoría punta a punta 2026-09-07
-- Cambios conservadores: reduce superficie RPC pública, elimina índice duplicado
-- y cubre FKs críticas del flujo comercial/fiscal/financiero.

-- RPCs de negocio: nunca deben ser ejecutables por anon/PUBLIC.
revoke execute on function public.save_quote_quick(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.save_quote_quick(uuid,uuid,jsonb,jsonb) to authenticated;

revoke execute on function public.transition_quote_status(uuid,text,text) from public;
grant execute on function public.transition_quote_status(uuid,text,text) to authenticated;

-- Funciones exclusivas de trigger: no necesitan exposición RPC.
revoke execute on function public.link_dte_receivable_to_commercial_source() from public;
revoke execute on function public.link_dte_receivable_to_commercial_source() from authenticated;
revoke execute on function public.mark_internal_income_documented_from_advance() from public;
revoke execute on function public.mark_internal_income_documented_from_advance() from authenticated;

-- Índice idéntico detectado por el linter; conservar accounts_receivable_dte_uidx.
drop index if exists public.accounts_receivable_dte_document_unique;

-- Índices de FKs del flujo Caja / anticipos / DTE.
create index if not exists cash_adjustments_cash_account_fkey_idx on public.cash_adjustments(cash_account_id);
create index if not exists cash_daily_closures_cash_account_fkey_idx on public.cash_daily_closures(cash_account_id);
create index if not exists cash_register_cuts_cash_account_fkey_idx on public.cash_register_cuts(cash_account_id);
create index if not exists cash_register_cuts_company_fkey_idx on public.cash_register_cuts(company_id);
create index if not exists cash_register_cuts_session_fkey_idx on public.cash_register_cuts(session_id);
create index if not exists cash_register_sessions_cash_account_fkey_idx on public.cash_register_sessions(cash_account_id);
create index if not exists cash_transfers_from_account_fkey_idx on public.cash_transfers(from_account_id);
create index if not exists cash_transfers_to_account_fkey_idx on public.cash_transfers(to_account_id);

create index if not exists customer_advance_applications_company_fkey_idx on public.customer_advance_applications(company_id);
create index if not exists customer_advance_applications_dte_fkey_idx on public.customer_advance_applications(dte_document_id);
create index if not exists customer_advances_cash_account_fkey_idx on public.customer_advances(cash_account_id);
create index if not exists customer_advances_dte_fkey_idx on public.customer_advances(dte_document_id);
create index if not exists customer_advances_quote_fkey_idx on public.customer_advances(quote_id);
create index if not exists customer_advances_work_order_fkey_idx on public.customer_advances(work_order_id);

create index if not exists dte_documents_quote_fkey_idx on public.dte_documents(quote_id);
create index if not exists dte_documents_work_order_fkey_idx on public.dte_documents(work_order_id);
create index if not exists dte_documents_source_quote_fkey_idx on public.dte_documents(source_quote_id);
create index if not exists dte_documents_source_work_order_fkey_idx on public.dte_documents(source_work_order_id);

create index if not exists internal_income_cash_account_fkey_idx on public.internal_income_records(cash_account_id);
create index if not exists internal_income_client_fkey_idx on public.internal_income_records(client_id);
create index if not exists internal_income_quote_fkey_idx on public.internal_income_records(quote_id);
create index if not exists internal_income_work_order_fkey_idx on public.internal_income_records(work_order_id);
