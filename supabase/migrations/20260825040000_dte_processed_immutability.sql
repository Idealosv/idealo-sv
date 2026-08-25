-- IDEALO SV: protección de inmutabilidad para DTE aceptados por Hacienda
-- Permite actualizar únicamente metadatos no fiscales después de PROCESSED.

create or replace function public.guard_processed_dte_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'PROCESSED' then
    raise exception 'DTE_PROCESSED_IMMUTABLE: no se puede eliminar un DTE aceptado por Hacienda';
  end if;

  if tg_op = 'UPDATE' and old.status = 'PROCESSED' then
    if new.company_id is distinct from old.company_id
      or new.client_id is distinct from old.client_id
      or new.dte_type is distinct from old.dte_type
      or new.generation_code is distinct from old.generation_code
      or new.control_number is distinct from old.control_number
      or new.environment is distinct from old.environment
      or new.dte_payload is distinct from old.dte_payload
      or new.signed_document is distinct from old.signed_document
      or new.mh_response is distinct from old.mh_response
      or new.mh_receipt_seal is distinct from old.mh_receipt_seal
      or new.mh_processed_at is distinct from old.mh_processed_at
      or new.mh_message_code is distinct from old.mh_message_code
      or new.mh_message is distinct from old.mh_message
    then
      raise exception 'DTE_PROCESSED_IMMUTABLE: el contenido fiscal y la evidencia MH no pueden modificarse después de PROCESSED';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_processed_dte_immutability on public.dte_documents;
create trigger trg_guard_processed_dte_immutability
before update or delete on public.dte_documents
for each row execute function public.guard_processed_dte_immutability();

comment on function public.guard_processed_dte_immutability() is
  'Impide alterar o eliminar el contenido fiscal y evidencia MH de DTE ya procesados.';
