# Prestadito$ — Runbook de ambiente de prueba

## Regla de seguridad

Este procedimiento se ejecuta **únicamente en una rama de desarrollo de Supabase o en un proyecto Supabase separado**.  
El proyecto principal conectado de IDEALO SV tiene ref `qltxsmuzgbuwevnncezz` y **no debe utilizarse como base de pruebas**.

El workflow `.github/workflows/prestaditos-staging-smoke.yml` contiene un bloqueo explícito para impedir que el smoke test se ejecute contra esa referencia de producción.

## Preparación del staging

1. Crear una rama de desarrollo de Supabase a partir de IDEALO SV o un proyecto separado.
2. Aplicar las migraciones de la rama `feat/prestaditos-inversionistas` en orden.
3. Configurar el frontend/API de staging con las URL y claves de esa base no productiva.
4. Guardar la cadena de conexión de la base de staging como secreto GitHub:
   `PRESTADITOS_STAGING_DB_URL`.
5. Ejecutar manualmente el workflow **Prestadito$ staging smoke**.
6. Confirmar el mensaje `PRESTADITOS_SMOKE_OK`.

## Escenario funcional de prueba

Usar solamente personas ficticias.

### Caso A — tasa 10% anual
- Capital de demostración: **$2,000**
- Plazo: **12 meses**
- Tasa: **10% anual**
- Referencia anual esperada: **$200**
- Recorrido:
  Inversionista → Solicitud → Aprobación → Fondos recibidos → Inversión → Contrato → Documento firmado → Pago de rendimiento → Vencimiento.

### Caso B — tasa 12% anual
- Capital de demostración: **$7,500**
- Plazo: **12 meses**
- Tasa: **12% anual**
- Referencia anual esperada: **$900**
- Recorrido:
  Inversionista → Solicitud → Inversión → Contrato → Pago → Renovación → Inversión sucesora.

### Caso C — tasa 15% anual
- Capital de demostración: **$15,000**
- Plazo: **12 meses**
- Tasa: **15% anual**
- Referencia anual esperada: **$2,250**
- Recorrido:
  Inversionista → Solicitud → Inversión → Contrato → Devolución de capital → No renovar → Cierre.

## Pruebas obligatorias

### Expedientes
- No permitir DUI duplicado dentro de la misma empresa.
- Verificar aislamiento por `company_id`.
- Cargar rostro y DUI frente/reverso.
- Probar OCR y confirmar manualmente antes de aplicar los datos.

### Solicitudes e inversiones
- Rechazo con motivo obligatorio.
- Impedir saltos ilegales de estado.
- Impedir formalizar sin `FUNDS_RECEIVED`.
- Impedir más de una inversión por solicitud.
- Verificar que capital, plazo y vencimiento queden protegidos.

### Tasas
- Aceptar únicamente 10%, 12% y 15%.
- Confirmar `return_rate_basis = 'ANNUAL'`.
- Para 12 meses, validar la referencia anual.
- Para cualquier plazo distinto de 12 meses, confirmar que el ERP **no inventa** el rendimiento total.

### Contratos y documentos
- Preparar contrato.
- Imprimir/guardar PDF.
- Cargar documento firmado.
- Verificar URL firmada temporal.
- Confirmar bucket privado.
- Inactivar/reactivar documento sin borrarlo.

### Pagos
- Registrar rendimiento.
- Registrar devolución de capital.
- Impedir devolver más capital que el principal pendiente.
- Revertir un pago con motivo obligatorio.
- Confirmar que el pago revertido no afecta totales vigentes.

### Renovaciones
- Registrar decisión antes del vencimiento dentro de la ventana permitida.
- Ejecutar renovación al vencimiento.
- Confirmar creación de inversión sucesora.
- Confirmar que la inversión anterior quede `RENEWED`.
- Probar retiro y exigir devolución completa de capital.

### Estado de cuenta, notificaciones y agenda
- Estado de cuenta muestra únicamente pagos vigentes.
- PDF incluye inversiones, movimientos y beneficiarios.
- Notificación revisada/archivada queda asociada al usuario.
- Agenda muestra vencimientos, firmas y renovaciones.
- Agenda no crea fechas de rendimientos que no hayan sido definidas.

### Cierre mensual
- Generar cierre.
- Generar una segunda versión del mismo mes.
- Confirmar que la primera versión siga disponible.
- Confirmar que el cierre no modifique inversiones ni pagos.

### Perfil 360 y búsqueda global
- Buscar por nombre, DUI, inversión, contrato, pago y documento.
- Cada resultado debe abrir el Perfil 360 del inversionista correspondiente.
- Probar accesos rápidos a estado de cuenta, contrato, pagos, renovación y documentos.

### Móvil
- Android: 360 px, 390 px y 412 px de ancho.
- iPhone: 375 px, 393 px y 430 px de ancho.
- Menú lateral debe funcionar como drawer.
- Búsqueda global debe ocupar todo el ancho disponible.
- Tablas deben desplazarse horizontalmente sin cortar acciones.
- Formularios y botones deben ser utilizables con tacto.

## Criterio de salida

No fusionar a `main` hasta que:
- el build web sea correcto;
- el smoke test de staging sea correcto;
- las pruebas específicas de Prestadito$ estén correctas;
- no existan errores de integridad en **Auditoría técnica**;
- se hayan revisado los fallos heredados de CI que puedan afectar el despliegue;
- se sustituya cualquier rango provisional de monto cuando Prestadito$ entregue la tabla oficial.
