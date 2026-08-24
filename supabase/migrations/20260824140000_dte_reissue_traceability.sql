-- IDEALO SV · trazabilidad de reemisión posterior a rechazo MH
alter table public.dte_documents
  add column if not exists reissued_from_id uuid references public.dte_documents(id) on delete set null;

create index if not exists dte_documents_reissued_from_idx
  on public.dte_documents(reissued_from_id)
  where reissued_from_id is not null;

create unique index if not exists dte_documents_one_active_reissue_uidx
  on public.dte_documents(reissued_from_id)
  where reissued_from_id is not null and status not in ('REJECTED','INVALIDATED');

comment on column public.dte_documents.reissued_from_id is
  'Documento rechazado de origen cuando este DTE fue preparado como reemisión; conserva el rechazado sin modificarlo.';