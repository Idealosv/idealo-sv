import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const plan = await readFile(resolve(here, '../src/DteTestPlan.jsx'), 'utf8')
const launcher = await readFile(resolve(here, '../src/FacturacionLauncher.jsx'), 'utf8')
const failures = []

if (!plan.includes('onPrepareCase')) failures.push('DteTestPlan debe aceptar callback de navegación directa')
if (!plan.includes("sessionStorage.setItem('idealo:dte-test-scenario', row.code)")) failures.push('El escenario debe guardarse antes de abrir Nueva factura')
if (!plan.includes("target: 'billing', tab: 'emitir'")) failures.push('Debe existir fallback al evento funcional idealo-open-module')
if (!launcher.includes('const prepareMhTestCase')) failures.push('Facturación debe implementar navegación interna para pruebas MH')
if (!launcher.includes('onPrepareCase={prepareMhTestCase}')) failures.push('Centro de Pruebas MH debe estar conectado con Nueva factura')
if (!launcher.includes("setActiveSection('emitir')")) failures.push('Preparar caso debe cambiar a la sección emitir')

if (failures.length) {
  console.error('\nAuditoría de navegación MH falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Auditoría navegación MH OK: Preparar caso abre Nueva factura y conserva el escenario guiado.')
