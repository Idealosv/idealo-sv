-- IDEALO SV: vertical comercial para venta mayorista de huevos
-- Se integra al Administrador de Membresías como un rubro vendible de la plataforma.

insert into public.saas_verticals (code, name, description, active)
values (
  'EGG_WHOLESALE',
  'Huevos por mayor',
  'Distribución mayorista de huevos: lotes, clasificación, inventario, pedidos, rutas, crédito y cobros.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now();
