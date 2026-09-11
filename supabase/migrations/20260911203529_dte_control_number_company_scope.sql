-- El número de control DTE pertenece a la serie del emisor/empresa.
-- Dos contribuyentes distintos pueden tener el mismo correlativo local sin colisionar entre sí.
alter table public.dte_documents drop constraint if exists dte_documents_control_number_key;
create unique index if not exists dte_documents_company_control_number_uidx
  on public.dte_documents(company_id,control_number);
