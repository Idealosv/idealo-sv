-- IDEALO SV · hardening de permisos por rol para Clientes 360
-- viewer: solo lectura
-- staff: lectura + alta + edición
-- owner/admin: CRUD completo

-- Tabla principal clients

drop policy if exists "Miembros pueden ver clientes" on public.clients;
create policy "Miembros pueden ver clientes"
on public.clients for select
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Miembros pueden crear clientes" on public.clients;
create policy "Equipo puede crear clientes"
on public.clients for insert
to authenticated
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
      and lower(cm.role) in ('owner','admin','staff')
  )
);

drop policy if exists "Miembros pueden actualizar clientes" on public.clients;
create policy "Equipo puede actualizar clientes"
on public.clients for update
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
      and lower(cm.role) in ('owner','admin','staff')
  )
)
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
      and lower(cm.role) in ('owner','admin','staff')
  )
);

drop policy if exists "Administradores pueden eliminar clientes" on public.clients;
create policy "Administradores pueden eliminar clientes"
on public.clients for delete
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = clients.company_id
      and cm.user_id = auth.uid()
      and lower(cm.role) in ('owner','admin')
  )
);

-- Tablas auxiliares de Clientes 360

do $$
declare
  t text;
begin
  foreach t in array array['client_contacts','client_addresses','client_activities'] loop
    execute format('drop policy if exists company_member_access on public.%I', t);
    execute format('drop policy if exists company_member_read on public.%I', t);
    execute format('drop policy if exists company_team_insert on public.%I', t);
    execute format('drop policy if exists company_team_update on public.%I', t);
    execute format('drop policy if exists company_admin_delete on public.%I', t);

    execute format(
      'create policy company_member_read on public.%I for select to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid()))',
      t, t
    );
    execute format(
      'create policy company_team_insert on public.%I for insert to authenticated with check (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and lower(m.role) in (''owner'',''admin'',''staff'')))',
      t, t
    );
    execute format(
      'create policy company_team_update on public.%I for update to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and lower(m.role) in (''owner'',''admin'',''staff''))) with check (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and lower(m.role) in (''owner'',''admin'',''staff'')))',
      t, t, t
    );
    execute format(
      'create policy company_admin_delete on public.%I for delete to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and lower(m.role) in (''owner'',''admin'')))',
      t, t
    );
  end loop;
end $$;
