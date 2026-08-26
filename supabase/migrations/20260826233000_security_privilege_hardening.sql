-- IDEALO SV · Seguridad transversal
-- RLS no protege TRUNCATE. El frontend no necesita TRUNCATE/TRIGGER/REFERENCES.

revoke all privileges on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- Evitar que tablas futuras vuelvan a heredar privilegios peligrosos.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- RPC auxiliares: nunca disponibles a usuarios anónimos mediante el privilegio PUBLIC.
revoke execute on function public.client_duplicate_candidates(uuid,uuid) from public, anon;
revoke execute on function public.refresh_client_commercial_tasks(uuid) from public, anon;
revoke execute on function public.sync_crm_opportunities_from_quotes(uuid) from public, anon;
revoke execute on function public.refresh_inventory_reserved_stock(uuid) from public, anon, authenticated;

grant execute on function public.client_duplicate_candidates(uuid,uuid) to authenticated;
grant execute on function public.refresh_client_commercial_tasks(uuid) to authenticated;
grant execute on function public.sync_crm_opportunities_from_quotes(uuid) to authenticated;

-- Funciones de trigger no son RPC públicas.
revoke execute on function public.crm_track_stage_change() from public, anon, authenticated;
revoke execute on function public.delete_quality_incident_cost() from public, anon, authenticated;
revoke execute on function public.guard_processed_dte_immutability() from public, anon, authenticated;
revoke execute on function public.idealo_products_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.normalize_client_optional_text() from public, anon, authenticated;
revoke execute on function public.recalc_payroll_run_totals() from public, anon, authenticated;
revoke execute on function public.sync_dte_mh_receipt_fields() from public, anon, authenticated;
revoke execute on function public.sync_labor_allocation_cost() from public, anon, authenticated;
revoke execute on function public.sync_quality_incident_cost() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_schedule_assignment_company() from public, anon, authenticated;
