-- Permisos necesarios para que la API (service_role) y usuarios autenticados
-- puedan consultar y registrar el historial de entrega de correos DTE.

grant select, insert, update
on table public.invoice_email_deliveries
to service_role;

grant select, insert, update
on table public.invoice_email_deliveries
to authenticated;

-- Refresca el esquema de PostgREST para que los grants estén disponibles
-- inmediatamente para la API.
notify pgrst, 'reload schema';
