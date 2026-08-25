-- IDEALO SV: consistencia defensiva del expediente de clientes
-- Evita que integraciones antiguas o formularios vacíos rompan el alta por enviar notes = null.

alter table public.clients
  alter column notes set default '';

create or replace function public.normalize_client_optional_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.notes := coalesce(new.notes, '');
  return new;
end;
$$;

drop trigger if exists clients_normalize_optional_text on public.clients;
create trigger clients_normalize_optional_text
before insert or update on public.clients
for each row execute function public.normalize_client_optional_text();
