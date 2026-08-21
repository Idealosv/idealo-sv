-- IDEALO SV: clientes de la empresa
create table if not exists public.clients (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) >= 2),
  email text,
  phone text,
  tax_id text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.clients add column if not exists tax_id text;

create index if not exists clients_company_name_idx
  on public.clients (company_id, name);

alter table public.clients enable row level security;

drop policy if exists "Miembros pueden ver clientes" on public.clients;
create policy "Miembros pueden ver clientes"
on public.clients for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Miembros pueden crear clientes" on public.clients;
create policy "Miembros pueden crear clientes"
on public.clients for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Miembros pueden actualizar clientes" on public.clients;
create policy "Miembros pueden actualizar clientes"
on public.clients for update
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Administradores pueden eliminar clientes" on public.clients;
create policy "Administradores pueden eliminar clientes"
on public.clients for delete
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists clients_touch_updated_at on public.clients;
create trigger clients_touch_updated_at
before update on public.clients
for each row execute function public.touch_updated_at();

grant select, insert, update, delete on table public.clients to authenticated;
