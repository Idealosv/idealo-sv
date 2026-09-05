-- Evita que PostgREST resuelva por error la versión antigua de register_internal_income.
-- La versión vigente incluye quote_id y work_order_id y valida la sesión abierta de la caja seleccionada.
drop function if exists public.register_internal_income(uuid,uuid,numeric,text,timestamptz,text,uuid,text,text);
