alter table public.dte_documents
  add column if not exists mh_receipt_seal text,
  add column if not exists mh_processed_at text,
  add column if not exists mh_message_code text,
  add column if not exists mh_message text;

update public.dte_documents
set mh_receipt_seal = coalesce(mh_receipt_seal, mh_response->>'selloRecibido'),
    mh_processed_at = coalesce(mh_processed_at, mh_response->>'fhProcesamiento'),
    mh_message_code = coalesce(mh_message_code, mh_response->>'codigoMsg'),
    mh_message = coalesce(mh_message, mh_response->>'descripcionMsg')
where mh_response is not null;

create or replace function public.sync_dte_mh_receipt_fields()
returns trigger
language plpgsql
as $$
begin
  if new.mh_response is not null then
    new.mh_receipt_seal := new.mh_response->>'selloRecibido';
    new.mh_processed_at := new.mh_response->>'fhProcesamiento';
    new.mh_message_code := new.mh_response->>'codigoMsg';
    new.mh_message := new.mh_response->>'descripcionMsg';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_dte_mh_receipt_fields on public.dte_documents;
create trigger trg_sync_dte_mh_receipt_fields
before insert or update of mh_response on public.dte_documents
for each row execute function public.sync_dte_mh_receipt_fields();
