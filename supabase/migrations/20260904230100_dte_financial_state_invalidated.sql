alter table public.dte_documents drop constraint if exists dte_documents_financial_state_check;
alter table public.dte_documents add constraint dte_documents_financial_state_check check (financial_state is null or financial_state in ('TEST_PERCEIVED','TEST_RECEIVABLE','PERCEIVED','RECEIVABLE','INVALIDATED'));
