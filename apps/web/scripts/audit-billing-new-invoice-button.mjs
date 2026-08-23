import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const launcher = await readFile(resolve(here, '../src/FacturacionLauncher.jsx'), 'utf8')
const dashboard = await readFile(resolve(here, '../src/Billing360Dashboard.jsx'), 'utf8')
const failures = []

if (!launcher.includes('const openNewInvoice = () =>')) failures.push('Falta manejador explícito para Nueva factura')
if (!launcher.includes("setActiveSection('emitir')")) failures.push('Nueva factura no activa la sección emitir')
if (!launcher.includes('data-billing-section={section.id}')) failures.push('Las pestañas no están identificadas')
if (!launcher.includes('onClick={() => openSection(section.id)}')) failures.push('La navegación interna no usa el manejador estable')
if (!launcher.includes('onOpenNewInvoice={openNewInvoice}')) failures.push('El resumen no tiene acceso directo a Nueva factura')
if (!dashboard.includes('onOpenNewInvoice')) failures.push('El dashboard no recibe el acceso directo a Nueva factura')

if (failures.length) {
  console.error('\nAuditoría botón Nueva factura falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría botón Nueva factura OK')
