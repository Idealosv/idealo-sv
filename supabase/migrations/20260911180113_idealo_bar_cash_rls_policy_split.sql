-- IDEALO BAR · evita políticas ALL que también cuentan como SELECT.
-- Mantiene exactamente la misma autorización de escritura y deja la lectura en una sola política.

do $do$
declare
  t text;
begin
  foreach t in array array['cash_accounts','cash_movements','cash_register_sessions','cash_register_cuts']
  loop
    execute format('drop policy if exists %I on public.%I',t||'_write',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert',t);
    execute format('drop policy if exists %I on public.%I',t||'_update',t);
    execute format('drop policy if exists %I on public.%I',t||'_delete',t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.erp_can_admin(company_id))',
      t||'_insert',t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id))',
      t||'_update',t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.erp_can_admin(company_id))',
      t||'_delete',t
    );
  end loop;
end;
$do$;
