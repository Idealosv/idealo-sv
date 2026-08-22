-- El CRM sincroniza cotizaciones como usuario autenticado. La tabla quotes ya tiene RLS activo,
-- por lo que el grant habilita acceso SQL pero las filas siguen limitadas por sus políticas.
grant select on public.quotes to authenticated;
revoke all on public.quotes from anon;
