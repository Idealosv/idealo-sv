-- Cotizaciones: restaura privilegios SQL de escritura para usuarios autenticados.
-- RLS continúa limitando el acceso a las filas de las empresas a las que pertenece el usuario.

grant select, insert, update, delete on table public.quotes to authenticated;
