-- IDEALO SV · Sales readiness
-- Una cotización comercial solo puede convertirse una vez en orden de trabajo.
-- Evita duplicados por doble clic, reintentos de red o dos sesiones concurrentes.

create unique index if not exists work_orders_one_per_quote_idx
  on public.work_orders(quote_id)
  where quote_id is not null;
