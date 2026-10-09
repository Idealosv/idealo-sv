# PRESTADITO$ — App de inversionistas unificada con el ERP

## Rama de desarrollo
\`feature/prestaditos-portal-unificado\` deriva de
\`feat/prestaditos-inversionistas\` (el ERP de Prestadito$ anterior, PR #443).
No depende de la rama alternativa \`feature/prestaditos-inversionistas\` (PR #446),
porque esa tenía otras tablas y habría creado **dos libros contables**.

## Flujo
1. El administrador abre \`/investors\` desde IDEALO SV.
2. En el módulo **App inversionistas** obtiene el enlace particular de la
   empresa: \`/prestaditos/app?company=<id>\`.
3. El inversionista crea su cuenta de Supabase Auth y envía registro con DNI,
   nombre y teléfono. Este paso NO permite leer inversiones.
4. Prestadito$ crea/revisa el expediente en **Inversionistas** y verifica
   identidad, DUI y correo de la cuenta.
5. Propietario/administrador vincula manualmente cuenta y expediente.
6. La app muestra solo inversiones, solicitudes y pagos del inversionista
   verificado. Usa una RPC privada sin conceder acceso genérico a la empresa.
7. Una solicitud de inversión llega a **inv_applications**; todo el flujo
   aprobado/firmado/fondos/formalización sigue igual que el ERP.
8. Un retiro llega a **inv_portal_withdrawals** como solicitud, SIN asiento.
   El administrador primero registra un pago en el ERP (inv_payments).
   Recién entonces puede cerrar la solicitud enlazándola al pago coincidente.

## Migraciones del portal
Después de las migraciones del ERP de Prestaditos:
1. \`20261009170000_prestaditos_portal_access.sql\`
2. \`20261009170100_prestaditos_portal_rpc.sql\`
3. \`20261009170200_prestaditos_portal_dashboard.sql\`

Estas migraciones NO se han aplicado a Supabase. Ejecutarlas solo en una
base aislada de pruebas tras revisión; la base IDEALO SV en producción
permanece intacta.

## Pruebas sin datos reales
- \`node apps/web/scripts/audit-prestaditos-portal.mjs\`
- Casos aislados: $2,000 al 10%, $7,500 al 12% y $15,000 al 15% ANUAL,
  todos de 12 meses, sin suponer prorrateos en otros plazos.
- Compilación React / Vite del frontend mediante GitHub Actions.
- Demo visual sin autenticación ni llamadas financieras:
  \`/prestaditos/app?demo=1\` (funciona tras desplegar código en entorno seguro).

## Seguridad pendiente antes de usar con inversionistas reales
- Pruebas reales de RLS en staging con dos usuarios de diferentes expedientes;
  verificar acceso cruzado a solicitud, DUI, pago y archivo.
- Prueba concurrente de aprobación y pago repetido.
- Asegurarse de que no se ofrezcan rendimientos garantizados, ni se habiliten
  aportes, retiros o captación pública sin verificar contratos y requisitos
  legales aplicables en El Salvador.
- Aprobación explícita antes de integrar con la rama main o con Render
  en producción.
- Vigilar límites de servicios existentes; no se crearon nuevos servicios,
  planes de pago ni pasarelas financieras.

## Alcance
- App web adaptable a celular; NO se ha distribuido un APK ni una app de tienda.
- Logo de marca de Prestadito$ y paleta roja / blanca / negra.
- Los préstamos a clientes y sus cobros quedan fuera del sistema.
- El ERP previo conserva inversiones, beneficiarios, contratos,
  renovaciones, vencimientos, documentos y cierre mensual.
