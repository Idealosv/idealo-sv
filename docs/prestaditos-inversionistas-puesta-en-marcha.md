# Puesta en marcha · PRESTADITOS INVERSIONISTAS

**Estado:** rama de desarrollo. No fusionar a main ni desplegar sin revisión.
**Infraestructura:** se aprovecha IDEALO SV (React/Vite, Supabase, Render).
No se crea un servicio adicional. El uso futuro de los proveedores puede generar
cargos si supera los límites del plan existente; vigilar el consumo.

## Accesos (al desplegar)
- ERP IDEALO SV: botón "Prestaditos Inversionistas" (propietarios y administradores).
- Panel Prestaditos: /prestaditos/admin
- Portal móvil: /prestaditos/app

## Pantallas listas
- Inicio de sesión y registro con Supabase Auth.
- Registro individual y aprobación del inversionista.
- Resumen de capital, rendimientos y pagos asentados.
- Solicitudes de inversión y retiro, historial y comprobantes privados.
- ERP de solicitudes, aprobación, procesamiento, inversionistas y reportes.
- Logo aportado por el propietario, paleta rojo / blanco / negro.

## Antes de habilitar datos reales
1. Ejecutar las migraciones SQL EN ORDEN, sobre una copia de pruebas primero:
   - 20261009123000_prestaditos_tables.sql
   - 20261009123100_prestaditos_approvals.sql
   - 20261009123200_prestaditos_settlement.sql
   - 20261009123300_prestaditos_record_yield.sql
2. Confirmar en Supabase Auth que el administrador de Prestaditos tiene cuenta
   válida y su correo está verificado.
3. Como operador de la base de datos, concederle el rol específico:
   insert into public.prestaditos_staff(user_id,role)
   select id,'admin' from auth.users
   where lower(email)=lower('CORREO_VERIFICADO_DEL_ADMIN')
   on conflict(user_id) do update set role=excluded.role;
4. Probar con DOS usuarios inversionistas independientes que ninguno pueda
   consultar datos o comprobantes del otro.
5. Comprobar que quien no figura en prestaditos_staff no abre el ERP financiero.
6. Comprobar que el administrador solo asienta una operación aprobada una vez y
   que no puede retirar más capital o rendimientos que el saldo registrado.
7. Verificar el formato DUI, tratamiento de datos personales, contratos, política
   de privacidad, requisitos regulatorios y aceptación de riesgos antes de ofrecer
   inversiones o recibir fondos.
8. Solo después de revisar CI, RLS y pruebas funcionales, aprobar despliegue.

## Flujo contable
- Un registro de usuario NO significa aceptación como inversionista.
- Un formulario enviado NO recibe ni mueve dinero.
- Una solicitud aprobada NO modifica capital ni rendimientos.
- «Procesar operación» se usa únicamente después de validar la operación por
  fuera del sistema; el procedimiento SQL bloquea la fila, verifica saldo para
  retiros y crea un movimiento con referencia única.
- Un rendimiento se registra manualmente con referencia contractual.
- Los saldos reflejan solo movimientos internos registrados.
- El módulo NO administra préstamos de prestatarios ni permite pagos automáticos.

## Consideraciones de producto
- Esta primera versión es una **app web móvil** adaptable. Para APK / app nativa
  se requerirán empaquetado y pruebas adicionales; no se compra licencia.
- Formulario de aportación permite adjuntar comprobantes JPG/PNG/PDF máximo 5MB.
- El administrador de IDEALO SV no recibe automáticamente permiso para leer
  datos de inversión: requiere alta explícita en prestaditos_staff.
- El panel de membresías comerciales de IDEALO SV permanece independiente.
