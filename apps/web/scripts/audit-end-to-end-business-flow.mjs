import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const src = (name) => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')
const expect = (condition, message) => { if (!condition) throw new Error(message) }

const commercial = src('CommercialLauncher.jsx')
const production = src('Production360Module.jsx')
const delivery = src('DeliveryFinanceModules.jsx')
const billing = src('FacturacionLauncher.jsx')
const receivables = src('BillingReceivablesPanel.jsx')
const mobile = src('MobileRuntimeGuard.jsx')
const menu = src('MainMenuController.jsx')

expect(commercial.includes("{id:'quote',label:'Cotización'}") && commercial.includes("{id:'collection',label:'Cobro'}"), 'El recorrido comercial visible no contiene Cotización → Cobro.')
expect(commercial.includes('initialWorkOrderId={flowContext.workOrderId}'), 'Entrega no recibe el contexto de la OT activa.')
expect(production.includes("step:'delivery'") && production.includes("next==='READY'"), 'Producción no salta a Entrega al llegar a READY.')
expect(delivery.includes("initialWorkOrderId = ''") && delivery.includes('work_order_id: initialWorkOrderId'), 'Entrega no preselecciona la OT recibida desde Producción.')
expect(delivery.includes("target: 'billing'") && delivery.includes('workOrderId: row.work_order_id'), 'Entrega no conserva la OT al abrir Facturación.')
expect(billing.includes("setActiveSection('cobros')") && billing.includes("String(row.status || '').toUpperCase() !== 'PROCESSED'"), 'Facturación no avanza a Cobros después de un DTE procesado.')
expect(billing.includes('focusWorkOrderId={projectContext.workOrderId}') && billing.includes('focusQuoteId={projectContext.quoteId}'), 'Facturación no pasa el contexto del proyecto a Cobros.')
expect(receivables.includes("focusWorkOrderId=''" ) && receivables.includes('row.work_order_id===focusWorkOrderId'), 'Cobros no puede enfocar la cuenta de la OT recién facturada.')
expect(menu.includes("name==='App móviles'"), 'App móviles no está accesible desde el menú principal.')
expect(mobile.includes("e.detail==='App móviles'" ) && mobile.includes("window.location.pathname!=='/mobile'"), 'El acceso App móviles no activa el runtime /mobile.')
console.log('✓ Navegación guiada: Cotización → OT → Producción → Entrega → Facturación → Cobro')
console.log('✓ App móviles: menú → runtime /mobile')

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

console.log('OK flujo integral ERP: Cliente → Cotización → OT → Producción → Entrega → Facturación → Cobro/CxC → Caja/Bancos → Conciliación/Reportes')
