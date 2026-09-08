delete from public.accounts_receivable
where id='74730cd8-0a41-45a0-8bf1-8e9dfc4c2404'::uuid
  and number=987650
  and concept='QA saldo'
  and client_id is null
  and dte_document_id is null;
