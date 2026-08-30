# IDEALO SV — Núcleo comercial SaaS

## Objetivo
Convertir IDEALO SV en una plataforma multiempresa reutilizable para vender sistemas por membresía y lanzar verticales sin duplicar el ERP completo.

## Modelo
- Una sola base tecnológica.
- Cada cliente opera como `company` aislada.
- Cada empresa tiene un `vertical` (rubro) y un `plan` comercial.
- Los módulos disponibles se resuelven por núcleo común + vertical + plan + excepciones por empresa.
- Facturación DTE, IA, usuarios, sucursales y almacenamiento pueden limitarse por plan.

## Planes iniciales
| Plan | Precio guía | Usuarios | Sucursales | DTE | IA |
| --- | ---: | ---: | ---: | --- | --- |
| Básico | $25/mes | 3 | 1 | No | No |
| Profesional | $50/mes | 10 | 3 | Sí | Sí |
| Empresa | $100/mes | 50 | 10 | Sí | Sí |

Los precios son configuración inicial del producto y pueden cambiar antes del lanzamiento comercial.

## Verticales iniciales
1. Publicidad.
2. Jurídico.
3. Restaurante y Bar.
4. Taller.
5. Comercio.
6. Servicios.

## Núcleo compartido
Dashboard, usuarios/roles, clientes, proveedores, caja/bancos, reportes y seguridad.

## Módulos especializados
- Publicidad: cotizaciones, producción, inventario, compras, DTE, IA.
- Jurídico: expedientes, actuaciones, documentos, agenda y cobros.
- Restaurante/Bar: mesas, comandas, cocina, barra, inventario y caja.
- Taller: vehículos, órdenes de servicio, repuestos, inventario y caja.

## Estados de suscripción
- `trial`: período de prueba.
- `active`: servicio vigente.
- `past_due`: pago vencido dentro del período de gracia.
- `suspended`: acceso comercial suspendido.
- `cancelled`: suscripción cancelada.

## Regla de seguridad
La aplicación del cliente solo puede leer su propia suscripción, configuración y facturación. Las mutaciones comerciales (crear planes, cambiar plan, suspender/reactivar, registrar cobros y activar módulos extraordinarios) deben ejecutarse desde backend/Panel Maestro usando credenciales de servicio, nunca desde el navegador del cliente.

## Siguiente fase
Construir el Panel Maestro IDEALO para:
- listar empresas;
- crear/activar empresa;
- asignar rubro y plan;
- iniciar prueba gratuita;
- cambiar estado de suscripción;
- ver vencimientos;
- activar/desactivar módulos;
- consultar usuarios, sucursales y consumo;
- registrar pagos y eventos comerciales;
- mostrar alertas de vencimiento y morosidad.

Después se implementará Jurídico como primer vertical nuevo para validar que la arquitectura funciona con dos rubros reales sobre el mismo núcleo.
