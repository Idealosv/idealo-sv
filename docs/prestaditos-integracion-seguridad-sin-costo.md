# Prestadito$ · Verificación gratuita y puerta de integración

**Estado:** preparación técnica, NO autorizada para producción.
**Rama:** `feature/prestaditos-portal-unificado` (PR #447)
**ERP base:** `feat/prestaditos-inversionistas` (PR #443).
**Objetivo:** misma base de datos y mismos asientos contables `inv_*`.

## Lo que hemos comprobado sin gastos adicionales

- 13 controles estáticos de integridad de la app y tres simulaciones ficticias
  de inversiones anuales del 10%, 12% y 15%.
- Un segundo auditor estático comprueba políticas RLS, permisos anónimos,
  separación administrativa, acceso personal, formularios, comprobantes y
  el registro de acciones dentro de `inv_audit_log`.
- GitHub Actions compila el frontend y ejecuta ambas auditorías. Puede usar
  minutos gratuitos según el cupo existente; no contratar planes ni recursos.
- Se consultaron **únicamente metadatos de Supabase**: la cuenta tiene una
  sola rama (principal) y aún no contiene las tablas financieras `inv_*`.
- **Ninguna migración de Prestadito$ fue aplicada al proyecto principal**.

## Refuerzos incorporados

1. Para aprobar una cuenta móvil se exige DUI con nueve dígitos y correo
   presente e idéntico en el expediente del ERP. La decisión requiere
   propietario o administrador autorizado.
2. Las cuentas de inversionistas no son miembros administrativos de la empresa:
   las verificaciones de inscripción y archivos usan funciones específicas
   con permisos mínimos, no acceso general a las tablas comerciales.
3. Retiros solo se solicitan desde un expediente aprobado, vinculado y
   activo; empresa financiera con acceso válido.
4. Una solicitud no registra ninguna transferencia. Para marcarla
   completada debe existir un pago asentado que coincida en empresa,
   inversionista, inversión, tipo y monto. Cada pago se vincula como máximo
   a una solicitud de retiro.
5. Comprobantes JPG/PNG/PDF de hasta 5 MB en bucket privado y ruta por
   empresa/usuario/solicitud, accesible con enlace temporal.
6. Aprobación de cuenta, rechazo, aportación, solicitud de retiro, revisión
   y comprobante dejan rastro en el registro de auditoría existente.
7. Cambio de cuenta en navegador borra en memoria los datos del usuario previo.
8. No se creó una tabla de contabilidad paralela.

## Qué NO se ha validado todavía (bloqueante)

El repositorio contiene la consulta `supabase/tests/prestaditos_portal_security_readonly.sql`.
Este archivo **no se ha ejecutado**, porque el proyecto principal no contiene
el ERP financiero y no hay una base de pruebas independiente sin coste
confirmado. Aun si esta consulta diera verde, NO sustituye las siguientes
pruebas reales con dos cuentas ficticias.

## Pruebas RLS reales requeridas antes de publicar

Ejecutar **solamente en ambiente desechable y aislado**, con datos inventados:

| Caso | Resultado obligatorio |
| --- | --- |
| Inversionista A pide inversiones/pagos de B con RPC | Denegado |
| Inversionista A intenta leer archivo de B / otra empresa | Denegado |
| Cuenta no aprobada o expediente bloqueado abre panel financiero | Denegado |
| Usuario anónimo accede a tablas o funciones financieras | Denegado |
| Operador sin rol owner/admin revisa cuentas o retiros | Denegado |
| Solicitud duplicada intenta reutilizar pago asentado | Denegado |
| Dos retiros simultáneos que exceden capital disponible | Denegados o bloqueados para revisión antes del pago |
| Cuenta A cambia a B sin reiniciar la pestaña | No quedan datos visibles de A |
| Empresa comercial distinta intenta aprobar vínculo o retirada | Denegado |
| Cuenta con DUI correcto y correo ausente/diferente | Denegado |
| Comprobante de otra solicitud o por ruta adulterada | Denegado |
| Reversión posterior de un pago vinculado | Requiere procedimiento conciliatorio |
| Financiera suspendida intenta nuevas solicitudes | Denegado |
| Admin concilia solicitud con pago válido | Una operación y una auditoría |

**Atención:** las reservas de capital en retiros pendientes, la revisión de
rendimientos exigibles y la conciliación de pagos revertidos requieren reglas
financieras y pruebas que aún no están cerradas. No gestionar fondos reales
hasta decidirlas.

## Plan seguro de activación (futuro, requiere aprobación expresa)

1. Confirmar legalmente esquema de inversión, contratos, manejo de datos
   personales, riesgos, tasas anuales y reglas de vencimiento/retiro.
2. Disponer de base local o staging aislado sin coste adicional confirmado.
   **No crear una rama Supabase de pago** ni servicio nuevo.
3. Aplicar únicamente al entorno de pruebas las migraciones existentes
   del ERP avanzado (septiembre 2026) y luego, en orden,
   `20261009170000` a `20261009170300` del portal.
4. Ejecutar los controles de catálogo de solo lectura y todas las pruebas
   de dos usuarios y roles. Revisar permisos y saldos tras cada prueba.
5. Validar el flujo IDEALO SV → ERP `/investors` →
   **App inversionistas** → enlace de acceso `/prestaditos/app?company=...`.
6. Confirmar todas las compilaciones en GitHub; resolver advertencias
   y errores de CI heredados antes de fusionar.
7. Solicitar autorización de publicación; fusionar primero ERP base #443 y
   después portal #447 (ajustando destino de ramas sin duplicar datos).
8. Hacer copia de seguridad verificada y definir reversión de cambios.
9. Activar solo tras autorización del dueño. Monitorear límites de Render
   y Supabase para evitar cobros.

## Resultado de la presente etapa

**Apto para revisión estática y demo ficticia.**
**NO APTO aún para producción ni aportaciones reales.**
