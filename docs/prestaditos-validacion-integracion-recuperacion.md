# Prestadito$ Inversionistas — integración visual y ensayo de recuperación
**Fecha:** 2026-10-09
**Rama:** feature/prestaditos-portal-unificado
**Propuesta:** https://github.com/Idealosv/idealo-sv/pull/447 (draft)
**Regla:** NO desplegar ni aplicar migraciones a producción sin autorización.

## 1. Integración a IDEALO SV
- Administrador de Membresías: enlace de acceso a `/investors`.
- ERP: acceso `/investors`, con selección de la empresa financiera desde el endpoint de contexto del ERP (no depende de seleccionar antes una empresa del workspace IDEALO SV).
- Portal de inversionistas: `/prestaditos/app?company=<uuid>`, enlace generado desde **App inversionistas** dentro del ERP.
- Misma contabilidad: tablas existentes `inv_investors`, `inv_applications`, `inv_investments`, `inv_payments`, `inv_audit_log`.
- Si no hay configuración Supabase en el ERP, se muestra un mensaje en vez de quedarse cargando indefinidamente.

## 2. Pruebas visuales hechas con Chromium
Ejecución: https://github.com/Idealosv/idealo-sv/actions/runs/37984104537

Aprobadas las 9 comprobaciones:
1. Demo móvil muestra nombre, inversiones y marca.
2. Logo carga en pantalla móvil.
3. Solicitud ficticia de aporte desde el formulario.
4. Solicitud ficticia de retiro desde el formulario.
5. Navegación móvil e historial de pagos.
6. Móvil sin desbordamiento horizontal en viewport de 390 px.
7. ERP demo carga en escritorio.
8. Cambio de secciones del ERP sin recarga.
9. Ruta real `/investors` monta ERP sin compañía IDEALO preseleccionada.

**Alcance:** ejecución local con navegador Chromium y datos simulados; no sustituye una prueba visual con usuario administrativo real en un despliegue de staging.

## 3. Respaldo y restauración REALES de base ficticia
Ejecución: https://github.com/Idealosv/idealo-sv/actions/runs/37984274627

- PostgreSQL 17 desechable, sin red de Supabase/Render de producción.
- `pg_dump` en formato personalizado y `pg_restore` en una SEGUNDA base vacía.
- Coincidieron cantidad y huella de cada registro en ocho tablas:
  `inv_investors`, `inv_investments`, `inv_applications`,
  `inv_payments`, `inv_portal_enrollments`, `inv_portal_links`,
  `inv_portal_withdrawals`, `inv_audit_log`.
- Se conservaron las políticas RLS y las restricciones para usuarios anónimos.
- Se modificó después un inversionista en la base de origen de QA y se verificó
  que la copia restaurada conservaba el valor anterior (cuenta bloqueada).
- Archivo de respaldo y bases destruidos al terminar el runner.

**Limitación:** este ensayo valida respaldo/recuperación de QA, NO constituye un
respaldo de los datos reales de IDEALO SV ni una prueba de revertir migraciones
o despliegues en producción. Tampoco prueba la restauración de archivos
almacenados en Supabase Storage: para producción será necesario respaldarlos
y verificar su recuperación por separado.

## 4. Pruebas anteriores
- RLS PostgreSQL y 45 comprobaciones: https://github.com/Idealosv/idealo-sv/actions/runs/37977296786
- Supabase Auth + Storage local y 73 comprobaciones: https://github.com/Idealosv/idealo-sv/actions/runs/37978989034

## 5. Condiciones obligatorias antes de publicar
1. Revisión jurídica del modelo de inversiones y contratos en El Salvador,
   incluidos tratamiento de datos personales, condiciones de rendimiento,
   riesgo, vencimientos, retiros y aspectos de captación de fondos.
2. Resolver cualquier defecto pendiente del ERP base (#443), verificar que
   solo PRESTADITO$ vea los datos de su vertical y evitar migraciones duplicadas.
3. Identificar el plan real y los límites gratuitos de Render, Supabase y
   GitHub Actions. No subir de plan, habilitar preview ni crear servicios
   facturables sin aprobación expresa.
4. Preparar un respaldo **REAL, cifrado, comprobado y recuperable**, con
   custodia segura, de la base de producción y de sus documentos (Storage),
   antes de aplicar cambios. Definir un procedimiento de recuperación probado.
5. Probar con usuario administrativo autorizado en un staging seguro
   antes de activar inversiones reales. Comprobar conciliación de pagos y
   el tratamiento de documentos y URLs firmadas antiguas.
6. Revisar la propuesta #443 y luego la #447. Mantener la #447 en borrador;
   no fusionar ni publicar sin consentimiento explícito del propietario.

## 6. Estado actual
Pruebas de navegación y recuperación **aprobadas con datos ficticios**.
ERP y aplicación aún NO publicados. Datos reales de producción intactos.
