# IDEALO SV · Auditoría Comercial para Venta

Objetivo: que una agencia pueda recorrer el ERP de demostración y encontrar un flujo coherente, sin duplicados operativos ni acceso fiscal real.

## Recorrido de evaluación

1. Dashboard: lectura ejecutiva y prioridades.
2. Clientes: expediente 360 y contexto comercial.
3. Productos: catálogo de trabajos terminados y precios.
4. Cotizaciones: cliente → productos/trabajos → pago/total → PDF.
5. Producción: cotización aprobada → una sola orden de trabajo → seguimiento de atrasos, materiales, calidad y rentabilidad.
6. Inventario: disponibilidad y control operativo.
7. Facturación: flujo comercial y DTE TEST; PRODUCCIÓN bloqueado en empresas demo.
8. Caja: cobros y control operativo.
9. Reportes: lectura financiera para propietario.

## Criterios de salida

- La demo usa únicamente datos ficticios identificados como DEMO.
- Cada consulta crítica se filtra por empresa.
- Una cotización solo puede originar una orden de trabajo, incluso ante reintentos concurrentes.
- El entorno demo no transmite DTE a PRODUCCIÓN.
- Los módulos comerciales principales permanecen cubiertos por auditorías automáticas y CI.

## Riesgo corregido en esta ronda

Se detectó que `work_orders.quote_id` tenía un índice normal, pero no unicidad. Aunque el flujo visual cambia la cotización a `CONVERTED`, dos clics/sesiones concurrentes podían intentar generar dos órdenes. Se incorpora un índice único parcial por `quote_id`. Antes de aplicarlo se verificó producción y no existen grupos de cotizaciones con órdenes duplicadas.
