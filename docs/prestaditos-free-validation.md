# Prestadito$ — Validación gratuita y puerta de producción

Fecha de revisión: 2026-09-21

## Qué se validó sin pagar staging

Mientras no exista una base separada de pruebas, la validación gratuita usa cuatro capas:

1. fixtures ficticios en memoria;
2. pruebas automáticas de código y reglas;
3. auditoría estática de migraciones/RLS/RPC;
4. vista previa web en Render.

No se escriben datos de Prestadito$ en la base principal de IDEALO SV.

## Casos ficticios

### QA-10
- Persona ficticia: Ana Lucía Prueba Diez
- Capital: $2,000
- Tasa: 10% anual
- Plazo: 12 meses
- Referencia anual: $200
- Flujo cubierto: contrato firmado → rendimiento → devolución de capital → retiro/cierre.

### QA-12
- Persona ficticia: Carlos David Prueba Doce
- Capital: $7,500
- Tasa: 12% anual
- Plazo: 12 meses
- Referencia anual: $900
- Flujo cubierto: contrato firmado → rendimiento → renovación → inversión sucesora activa.

### QA-15
- Persona ficticia: María Fernanda Prueba Quince
- Capital: $15,000
- Tasa: 15% anual
- Plazo: 12 meses
- Referencia anual: $2,250
- Flujo cubierto: contrato firmado → rendimiento → devolución de capital → cierre.

Los fixtures viven en `apps/web/src/prestaditos-free-qa-fixtures.js` y sus pruebas en `apps/api/test/prestaditos-free-full-flow.test.js`.

## Seguridad específica de Prestadito$

Se añadió una migración de endurecimiento:
`20260921224500_prestaditos_security_hardening.sql`.

Esta migración:
- revoca EXECUTE de todos los RPC `inv_*` a `public`;
- revoca EXECUTE de todos los RPC `inv_*` a `anon`;
- vuelve a conceder únicamente los RPC necesarios a `authenticated` y `service_role`;
- mantiene las tablas sensibles sin escrituras directas autenticadas.

El smoke test de staging también comprueba:
- RLS activo;
- bucket `investor-documents` privado y limitado a 10 MB;
- ausencia de INSERT/UPDATE/DELETE directo en tablas sensibles;
- ausencia de RPC `inv_*` ejecutables por `anon`.

## Revisión del proyecto Supabase principal

Se consultaron los Advisors del proyecto principal de IDEALO SV en modo lectura. El proyecto actual contiene advertencias heredadas de otros verticales, entre ellas funciones SECURITY DEFINER ejecutables por `anon` en módulos existentes como BAR/EGGS.

No se modificó esa base ni se mezclaron esas correcciones con Prestadito$.

Referencia de remediación Supabase:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## CI heredado

Se corrigieron tres comprobaciones desactualizadas:
- auditoría móvil esperaba imports estáticos aunque los runtimes ahora son lazy;
- prueba de performance esperaba imports estáticos y un módulo HR ya retirado;
- prueba DTE esperaba timeout 8 s cuando la configuración endurecida actual exige mínimo 45 s.

La validación debe volver a ejecutarse en cada commit antes de considerar la rama cerrada.

## Puerta de producción

La rama no debe fusionarse a `main` mientras cualquiera de estos puntos siga abierto:

- rangos oficiales de monto para 10%, 12% y 15%;
- regla para plazos distintos de 12 meses;
- texto legal definitivo del contrato;
- validación en una base staging separada;
- CI general completamente verde;
- prueba física final en Android/iPhone cuando corresponda.

El ERP muestra estos bloqueos dentro de **Auditoría técnica → Puerta de producción**.


## Operación y capacitación

Se añadió un modelo explícito de acceso para Prestadito$:
- Propietario;
- Administrador;
- Operador;
- Solo lectura.

El rol `staff` de IDEALO SV se interpreta como Operador. Propietario y Administrador conservan las decisiones financieras sensibles. Operador puede trabajar expedientes, registrar solicitudes y cargar documentos. Solo lectura no puede mutar datos.

También se añadieron:
- módulo **Exportaciones**, restringido a Propietario/Administrador;
- respaldo JSON estructurado;
- CSV por conjunto de datos;
- módulo **Ayuda** con manual interno;
- modo capacitación con checklist;
- validación de que rendimientos revertidos no se sumen en el Perfil 360.

Los archivos binarios del bucket privado no se incrustan en las exportaciones; solo se incluyen metadatos y rutas privadas.
