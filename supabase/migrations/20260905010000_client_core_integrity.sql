-- Clientes: atomicidad de crédito, primarios únicos y coordenadas válidas.

create or replace function public.client_contacts_single_primary()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.is_primary then
    update public.client_contacts
       set is_primary = false, updated_at = now()
     where company_id = new.company_id
       and client_id = new.client_id
       and is_primary = true
       and id is distinct from new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.client_contacts_single_primary() from public, anon, authenticated;

drop trigger if exists trg_client_contacts_single_primary on public.client_contacts;
create trigger trg_client_contacts_single_primary
before insert or update of is_primary, company_id, client_id on public.client_contacts
for each row execute function public.client_contacts_single_primary();

create or replace function public.client_addresses_single_primary()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.is_primary then
    update public.client_addresses
       set is_primary = false, updated_at = now()
     where company_id = new.company_id
       and client_id = new.client_id
       and is_primary = true
       and id is distinct from new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.client_addresses_single_primary() from public, anon, authenticated;

drop trigger if exists trg_client_addresses_single_primary on public.client_addresses;
create trigger trg_client_addresses_single_primary
before insert or update of is_primary, company_id, client_id on public.client_addresses
for each row execute function public.client_addresses_single_primary();

create or replace function public.sync_client_credit_profile_to_client()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.clients
     set credit_limit = coalesce(new.credit_limit, 0),
         credit_days = coalesce(new.credit_days, 0),
         blocked_for_debt = coalesce(new.blocked, false),
         updated_at = now()
   where id = new.client_id
     and company_id = new.company_id;
  if not found then
    raise exception 'No se encontró el cliente de la empresa para sincronizar el crédito';
  end if;
  return new;
end;
$$;
revoke all on function public.sync_client_credit_profile_to_client() from public, anon, authenticated;

drop trigger if exists trg_client_credit_profile_sync on public.client_credit_profiles;
create trigger trg_client_credit_profile_sync
after insert or update of credit_limit, credit_days, blocked, company_id, client_id on public.client_credit_profiles
for each row execute function public.sync_client_credit_profile_to_client();

alter table public.client_addresses
  drop constraint if exists client_addresses_latitude_range,
  add constraint client_addresses_latitude_range
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.client_addresses
  drop constraint if exists client_addresses_longitude_range,
  add constraint client_addresses_longitude_range
  check (longitude is null or (longitude >= -180 and longitude <= 180));

alter table public.clients
  drop constraint if exists clients_latitude_range,
  add constraint clients_latitude_range
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.clients
  drop constraint if exists clients_longitude_range,
  add constraint clients_longitude_range
  check (longitude is null or (longitude >= -180 and longitude <= 180));
