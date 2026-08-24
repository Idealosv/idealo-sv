import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const steps = [
  ['Clientes → Productos → Cotizaciones', 'audit-commercial-flow.mjs'],
  ['Cotización aprobada → Producción', 'audit-quote-production-flow.mjs'],
  ['Producción → Inventario', 'audit-production-inventory-flow.mjs'],
  ['Inventario/Reposición → Compra → Recepción', 'audit-procurement-receiving-flow.mjs'],
  ['Compra recibida → CxP → Caja', 'audit-payables-cash-flow.mjs'],
  ['Facturación/DTE → CxC → Caja', 'audit-receivables-cash-flow.mjs'],
  ['Caja/Bancos → Conciliación → Reportes', 'audit-cash-reconciliation-flow.mjs'],
]

for (const [label, script] of steps) {
  const scriptPath = fileURLToPath(new URL(script, import.meta.url))
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Flujo integral roto en: ${label}`)
  }
  console.log(`✓ ${label}`)
}

console.log('OK flujo integral ERP: Cliente → Cotización → Producción → Inventario/Compras → Facturación → CxC/CxP → Caja/Bancos → Conciliación/Reportes')
