# Checklist de saneamiento estructural

- [x] Identificar colisiones históricas de migraciones.
- [x] Bloquear nuevas colisiones mediante pruebas automáticas.
- [x] Confirmar `Workspace.jsx` como entrypoint autenticado activo.
- [x] Bloquear reactivación accidental del entrypoint legacy.
- [x] Verificar que la auditoría principal conserve los flujos comerciales, productivos, inventario, compras, caja y móvil.
- [ ] Comparar historial real aplicado en Supabase antes de cualquier consolidación destructiva.
- [ ] Sustituir gradualmente parches DOM por componentes React controlados.
- [ ] Incorporar navegador E2E real cuando la infraestructura de CI lo permita.
