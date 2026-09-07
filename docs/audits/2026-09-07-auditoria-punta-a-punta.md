# Auditoría punta a punta · IDEALO SV

Fecha: 2026-09-07

## Alcance

Revisión técnica del flujo comercial, producción, Caja, Cuentas por Cobrar, anticipos, DTE, Supabase, API, firmador y despliegues Render. La auditoría combinó inspección de código, validaciones automáticas, consultas de integridad en producción, advisories de Supabase y logs reales de Render/Hacienda TEST.

## Resultado ejecutivo

El núcleo transaccional revisado no presentó inconsistencias activas en los controles de integridad ejecutados: no se encontraron pagos negativos, sobrepagos, anticipos sobreaplicados, duplicados de número de control/generación, DTE TEST contabilizados como finanzas reales, stock negativo ni desalineaciones cliente/cotización/OT en los chequeos efectuados.

Durante la auditoría se detectaron y corrigieron problemas reales que sí requerían acción:

1. **Desfase GitHub ↔ Supabase:** la migración que enlaza pagos de trabajos con anticipos aplicables al DTE estaba en GitHub pero no había sido aplicada en la base de producción. Se aplicó y se verificó el backfill sin duplicar Caja.
2. **Superficie RPC innecesaria:** se retiró acceso `PUBLIC` a RPCs de negocio y funciones exclusivas de triggers que no debían estar expuestas como RPC anónimas.
3. **Índice duplicado en CxC:** se eliminó un índice único redundante sobre `accounts_receivable(dte_document_id)`.
4. **FKs críticas sin índice:** se agregaron índices al flujo Caja → anticipo → DTE → CxC y a relaciones de cotización/OT.
5. **Firmador:** se desactivó la API administrativa de Caddy (`admin off`) para reducir superficie expuesta y evitar ruido de detección de puerto/admin API.
6. **Hacienda TEST:** se identificó en logs el rechazo código `096` por referencia de pago demasiado larga/inválida y se corrigió la normalización del campo antes de transmisión.

## Controles de integridad ejecutados

Todos devolvieron `0` registros afectados al cierre de esta auditoría:

- WORK_ORDER_CLIENT_MISMATCH
- WORK_ORDER_COMPANY_MISMATCH
- QUOTE_NEGATIVE_TOTAL
- QUOTE_ITEM_INVALID
- AR_OVERPAID_OR_NEGATIVE
- AP_OVERPAID_OR_NEGATIVE
- ADVANCE_OVERAPPLIED
- PAYMENT_NONPOSITIVE
- SUPPLIER_PAYMENT_NONPOSITIVE
- CASH_MOVEMENT_NONPOSITIVE
- INVENTORY_NEGATIVE_STOCK
- INVENTORY_RESERVED_GT_STOCK
- DTE_DUP_CONTROL
- DTE_DUP_GENERATION
- DTE_PROCESSED_WITHOUT_SEAL
- DTE_TEST_POSTED_FINANCE
- OPEN_CASH_DUPLICATE
- DUP_CASH_SOURCE

El auditor financiero de DTE también devolvió cero errores/advertencias en TEST_REAL_RECEIVABLE, TEST_REAL_CASH, CREDIT_WITHOUT_RECEIVABLE, CASH_WITHOUT_COLLECTION, RECEIVABLE_BALANCE_MISMATCH, ADVANCE_OVERAPPLIED, INVALIDATED_WITH_LIVE_FINANCE y REISSUE_WITHOUT_SOURCE.

## Caso comercial crítico validado

Caso objetivo del flujo actual:

- Trabajo/cotización: **$80.00**
- Pago previo: **$40.00**
- CCF: **$80.00**
- Anticipo aplicable: **$40.00**
- Saldo posterior en CxC: **$40.00**
- Caja: el primer pago de $40.00 debe existir una sola vez y nunca duplicarse al procesar el DTE.

La base ya dispone del enlace `internal_income_records → customer_advances` y de la protección que evita un segundo movimiento de Caja para anticipos creados desde un pago previamente registrado.

## Seguridad

### Corregido

- RPCs `save_quote_quick` y `transition_quote_status`: ya no ejecutables por `PUBLIC`; siguen disponibles para `authenticated` porque son operaciones funcionales del ERP y contienen controles de autorización.
- Funciones de trigger `link_dte_receivable_to_commercial_source` y `mark_internal_income_documented_from_advance`: retiradas de exposición RPC directa.
- API administrativa de Caddy desactivada en el firmador.

### Pendiente / revisión progresiva

- Supabase reporta advertencias para varias funciones `SECURITY DEFINER` ejecutables por usuarios autenticados. Muchas son RPCs intencionales del ERP y contienen control de rol/empresa; deben revisarse una por una antes de revocar, para no romper operaciones válidas.
- La protección de contraseñas filtradas/comprometidas de Supabase Auth aparece desactivada. Debe habilitarse en la configuración de Auth antes de una salida comercial amplia.
- `dte_control_sequences` tiene RLS habilitado sin políticas. Por su naturaleza de tabla interna de secuencias esto puede ser intencional; no debe abrirse a clientes sin una necesidad explícita.

## Rendimiento

Se agregaron índices a las relaciones más sensibles del flujo financiero/fiscal. Persisten advisories de rendimiento de menor riesgo:

- políticas RLS con `auth.*` evaluado por fila (`auth_rls_initplan`);
- políticas permisivas superpuestas de lectura/escritura en varias tablas;
- FKs sin índice en módulos secundarios (legal, SaaS, auditoría administrativa y algunos registros de compras/gastos);
- índices marcados como “unused”; no se eliminaron porque el sistema todavía tiene poca historia de carga y varios fueron recién creados.

Estos puntos deben optimizarse por lotes, con pruebas de regresión, no mediante borrado masivo.

## Render y disponibilidad

El commit de hardening `94e66a7ac617ce18529f19ab59504f371b3c860f` quedó desplegado en estado `live` en:

- Frontend web
- API
- Firmador

Después del cambio del firmador no se observó nuevamente en la ventana revisada el mensaje de Caddy `admin.api host not allowed`; el servicio quedó `live`.

## Pruebas automáticas

La validación continua del PR de hardening terminó correctamente:

- instalación de dependencias: OK
- auditoría de dependencias: OK
- pruebas API: OK
- auditoría estructural del frontend: OK
- compilación frontend: OK

### Cobertura que falta incorporar

No se considera suficiente una suite de API para certificar toda la experiencia comercial. Antes de entregar la demo final se recomienda agregar pruebas de navegador (Playwright/Cypress o equivalente) para al menos:

1. login;
2. Dashboard;
3. alta/búsqueda de cliente;
4. cotización;
5. conversión a OT;
6. pago/anticipo en Caja;
7. creación de CCF;
8. Documentos/Hacienda TEST;
9. Cuentas por cobrar;
10. pago final y cierre de saldo;
11. permisos por rol;
12. modo DEMO.

## Estado DTE

La integración ya ha alcanzado Hacienda TEST y devuelve observaciones reales de cumplimiento. El último rechazo auditado fue por `resumen.pagos[0].referencia`, corregido en el código. Un DTE rechazado debe conservarse como historial y un nuevo intento debe usar nuevo control/generación.

No se declara todavía “certificación de producción” porque no existe en esta auditoría un DTE de PRODUCCIÓN aceptado por MH que permita cerrar formalmente esa evidencia. La demo comercial debe bloquear PRODUCCIÓN y usar únicamente datos ficticios/Test.

## Arquitectura recomendada para la DEMO

La opción recomendada es **aislamiento completo**:

- rama de código `demo/commercial-showcase`;
- base Supabase separada;
- API Render separada;
- frontend Render separado;
- sin firmador real ni credenciales MH de producción;
- datos 100% ficticios;
- banner permanente `MODO DEMOSTRACIÓN`;
- bloqueo de transmisión DTE producción;
- bloqueo de correo externo;
- capacidad de reiniciar datos demo.

La base actual ya tiene infraestructura para `companies.demo_mode`, `saas_company_demo_profiles` y guardas de DTE en producción; se reutilizará como segunda línea de defensa, pero no sustituye el aislamiento de una base independiente.

## Conclusión

IDEALO SV tiene un núcleo funcional avanzado y los controles de integridad auditados quedaron limpios, pero la preparación comercial debe continuar con dos objetivos: (1) cerrar hardening/UX y pruebas de navegador, y (2) crear una DEMO aislada que nunca comparta datos ni credenciales fiscales con producción.
