-- IDEALO SV: empresa inicial y módulo de clientes

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_company_id_idx on public.clients(company_id);
create index clients_name_idx on public.clients(company_id, name);

alter table public.clients enable row level security;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_company_with_owner(
  company_name text,
  company_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if length(trim(company_name)) < 2 then
    raise exception 'El nombre de la empresa es obligatorio';
  end if;

  insert into public.companies (name, slug, created_by)
  values (trim(company_name), lower(trim(company_slug)), auth.uid())
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, auth.uid(), 'owner');

  return new_company_id;
end;
$$;

create policy "members_read_clients"
on public.clients for select
using (public.is_company_member(company_id));

create policy "members_create_clients"
on public.clients for insert
with check (
  public.is_company_member(company_id)
  and created_by = auth.uid()
);

create policy "members_update_clients"
on public.clients for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "members_delete_clients"
on public.clients for delete
using (public.is_company_member(company_id));

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.create_company_with_owner(text, text) to authenticated;

grant select, insert, update, delete on table public.clients to authenticated;
grant all privileges on table public.clients to service_role;
