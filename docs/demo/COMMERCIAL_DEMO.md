# IDEALO SV · DEMO COMERCIAL

Esta rama es una variante de muestra del ERP. **No debe fusionarse a `main`** porque incorpora bloqueos y rótulos específicos de demostración.

## Objetivo

Entregar una URL que pueda enviarse a posibles compradores sin exponer datos, credenciales ni operaciones reales de IDEALO SV Producción.

## Aislamiento obligatorio

La demo final debe utilizar:

- proyecto Supabase separado;
- servicio API Render separado;
- frontend Render separado;
- rama `demo/commercial-showcase`;
- `DEMO_MODE=true` en la API;
- base con una empresa `demo_mode=true`;
- `saas_company_demo_profiles.is_demo=true`;
- datos 100% ficticios.

Nunca se deben copiar al entorno demo:

- contraseñas o tokens de Hacienda;
- certificado fiscal del emisor real;
- token del firmador real;
- credenciales Gmail reales;
- usuarios/clientes/proveedores de producción;
- movimientos reales de Caja/Banco;
- DTE reales.

## Bloqueos incorporados en esta rama

Cuando `DEMO_MODE=true`, la API devuelve 403 para acciones externas o fiscales sensibles:

- cambio de configuración DTE;
- diagnóstico de autenticación MH;
- diagnóstico del firmador;
- prueba Gmail/PDF por correo;
- reenvío de correo de factura;
- preparación/transmisión de contingencia;
- firma TEST y PRODUCCIÓN;
- transmisión TEST y PRODUCCIÓN;
- invalidación fiscal;
- eventos/lotes de contingencia.

La creación local de borradores puede mantenerse para demostrar el flujo de trabajo sin enviar nada fuera del sistema.

El frontend muestra permanentemente:

`IDEALO SV · MODO DEMOSTRACIÓN · DATOS FICTICIOS · SIN EMISIÓN FISCAL REAL`

## Datos recomendados para la muestra

Crear una empresa ficticia, por ejemplo **Agencia Creativa Demo SV**, y poblarla con información sintética:

- 20–30 clientes ficticios;
- 25–40 cotizaciones en distintos estados;
- 12–20 órdenes de trabajo;
- inventario de lona, vinil, PVC, acrílico, tinta y accesorios;
- Caja y banco ficticios;
- pagos parciales y anticipos simulados;
- CxC con saldos vencidos y vigentes;
- compras/proveedores ficticios;
- documentos DTE TEST simulados/presembrados, claramente rotulados como prueba.

Debe incluir al menos el caso demostrativo:

- Trabajo: $80.00
- Pago previo: $40.00
- CCF de muestra: $80.00
- Anticipo aplicado: $40.00
- CxC restante: $40.00
- Caja sin duplicación del primer pago.

## Acceso comercial

Recomendación para la cuenta de muestra:

- usuario de demostración con rol limitado;
- sin acceso a configuración fiscal/secrets;
- contraseña rotativa;
- posibilidad de reiniciar los datos;
- expiración o revocación rápida cuando termine la presentación.

## Despliegue

No desplegar esta rama contra el Supabase de producción. Primero crear el proyecto Supabase independiente, ejecutar migraciones, crear la empresa demo y sembrar datos ficticios. Después crear API y frontend separados en Render apuntando exclusivamente a ese proyecto.
