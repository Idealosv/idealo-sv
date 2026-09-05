create or replace function public.validate_dte_document_payload_integrity()
returns trigger
as $function$
declare
  v_ambiente text;
  v_expected_ambiente text;
  v_tipo text;
  v_control text;
  v_generation text;
begin
  if new.environment not in ('test','production') then
    raise exception 'DTE_ENVIRONMENT_INVALID';
  end if;
  if new.dte_payload is null or jsonb_typeof(new.dte_payload) <> 'object' then
    raise exception 'DTE_PAYLOAD_REQUIRED';
  end if;

  v_expected_ambiente := case when new.environment='production' then '01' else '00' end;
  v_ambiente := new.dte_payload #>> '{identificacion,ambiente}';
  v_tipo := new.dte_payload #>> '{identificacion,tipoDte}';
  v_control := new.dte_payload #>> '{identificacion,numeroControl}';
  v_generation := upper(coalesce(new.dte_payload #>> '{identificacion,codigoGeneracion}',''));

  if v_ambiente is distinct from v_expected_ambiente then
    raise exception 'DTE_PAYLOAD_ENVIRONMENT_MISMATCH';
  end if;
  if v_tipo is distinct from new.dte_type then
    raise exception 'DTE_PAYLOAD_TYPE_MISMATCH';
  end if;
  if v_control is distinct from new.control_number then
    raise exception 'DTE_PAYLOAD_CONTROL_NUMBER_MISMATCH';
  end if;
  if v_generation is distinct from upper(new.generation_code::text) then
    raise exception 'DTE_PAYLOAD_GENERATION_CODE_MISMATCH';
  end if;

  if new.status in ('SIGNED','TRANSMITTING','TRANSMISSION_UNKNOWN','PROCESSED','REJECTED')
     and nullif(btrim(coalesce(new.signed_document,'')),'') is null then
    raise exception 'DTE_SIGNED_DOCUMENT_REQUIRED';
  end if;
  if new.environment='production' and new.status='PROCESSED'
     and nullif(btrim(coalesce(new.mh_receipt_seal,'')),'') is null then
    raise exception 'DTE_PRODUCTION_RECEIPT_SEAL_REQUIRED';
  end if;
  return new;
end;
$function$
language plpgsql
set search_path = public;

revoke all on function public.validate_dte_document_payload_integrity() from public, anon, authenticated;

drop trigger if exists trg_zz_validate_dte_document_payload_integrity on public.dte_documents;
create trigger trg_zz_validate_dte_document_payload_integrity
before insert or update of environment,dte_type,control_number,generation_code,dte_payload,status,signed_document,mh_receipt_seal
on public.dte_documents
for each row execute function public.validate_dte_document_payload_integrity();
