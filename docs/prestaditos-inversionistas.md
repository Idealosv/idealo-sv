# PRESTADITOS INVERSIONISTAS · Módulo IDEALO SV

## Objetivo
Crear un sistema **exclusivamente para inversionistas** de Prestaditos El Salvador,
integrado como módulo adicional de IDEALO SV y sin mezclar su información con
clientes o cobros de préstamos del ERP publicitario.

## Condición de costo
- Desarrollo inicial en rama independiente; no implementar cargos automáticos.
- Reutilizar React + Vite, API Node/Express, Supabase y Render ya existentes.
- No provisionar servicios nuevos ni mejorar planes sin aprobación del propietario.
- Vigilar límites de uso: reutilizar servicios existentes **no garantiza** ausencia
  de futuros cargos por consumo.
- No fusionar ni desplegar en producción hasta probar, revisar y aprobar.

## Identidad de marca
- Utilizar el **logo original proporcionado** de PRESTADITOS, no recrearlo.
- Colores: rojo corporativo, blanco, negro y grises neutros.
- Aplicación móvil y panel administrativo con la misma línea gráfica.
- Mención discreta: "Un sistema de IDEALO SV".

## App móvil para inversionistas
1. Pantallas iniciales: bienvenida, inicio de sesión, registro / solicitud de acceso.
2. Resumen: capital aportado, rendimientos registrados, pagos y movimientos.
3. Formulario de solicitud de inversión: datos personales, monto, medio de aporte,
   fecha prevista, comprobante y observaciones.
4. Formulario de solicitud de retiro: capital/rendimientos, monto, medio de pago,
   destino y observaciones.
5. Estado e historial de solicitudes: pendiente, revisión, aprobada, rechazada,
   procesada; notificaciones.
6. Contratos y documentos, política de privacidad y advertencia de riesgos.
7. Cada inversionista solo puede ver sus propios datos y solicitudes.

## ERP administrativo de Prestaditos
1. Indicadores de capital, solicitudes pendientes y pagos procesados.
2. Revisión de identidad y aprobación / rechazo de solicitudes con motivo.
3. Fichas de inversionistas, historial de aportaciones, movimientos y documentos.
4. Rendimientos: cargar solamente los que correspondan a contratos y operaciones
   verificadas; nunca prometer retornos garantizados por defecto.
5. Procesos de retiro y pago con autorizaciones y comprobantes.
6. Reportes exportables y auditoría con usuario/fecha/acción.
7. Roles aislados: administrador de Prestaditos, personal autorizado, inversionista.
8. Sin administración de préstamos a deudores.

## Diseño técnico propuesto
- Portal IDEALO SV: entrada "Prestaditos Inversionistas" con acceso explícito.
- UI administrativa: nuevo módulo React aislado del administrador de membresías.
- UI inversionistas: frontend móvil adaptativo y rutas de acceso propias.
- Backend: rutas API aisladas para solicitudes, aportes, retiros y rendimientos.
- Supabase: nuevas tablas con aislamiento por inversionista y políticas RLS.
- Archivos privados: documentos de identidad y comprobantes en almacenamiento
  restringido, acceso firmado y permisos por rol.
- Nunca almacenar documentos sensibles en repositorios, logs o almacenamiento público.
- Los montos y rendimientos se registran con trazabilidad, no se editan sin auditoría.

## Reglas de lanzamiento
- Confirmar modelo legal de captación/inversión y contratos aplicables en El Salvador
  antes de recibir aportes o activar oferta pública.
- No conectar pasarelas de pago ni automatizar transferencias sin revisión legal,
  bancaria y de seguridad.
- Probar permisos RLS, pruebas de integración y regresión del ERP antes de publicar.
- Mantener la aplicación existente funcionando sin cambios visibles hasta aprobación.

## Estado
- Etapa 0: documentación y rama de desarrollo.
- No se han habilitado formularios de producción ni movimientos de dinero.
