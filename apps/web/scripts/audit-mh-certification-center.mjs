import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFile(resolve(here, '../src/' + name), 'utf8')
const [center, launcher, invoice] = await Promise.all([
  read('MhCertificationCenter.jsx'), read('FacturacionLauncher.jsx'), read('FacturacionDte.jsx'),
])

// No se aceptan contadores falsos, editables manualmente ni pruebas de producción.
for (const code of ['DTE:01', 'DTE:03', 'DTE:04', 'DTE:05', 'DTE:06', 'DTE:07', 'DTE:08', 'DTE:09', 'DTE:11', 'DTE:14', 'DTE:15', 'EVENT:CONTINGENCY', 'EVENT:INVALIDATION', 'EVENT:RETURN', 'EVENT:SPECIAL_OPERATIONS']) {
  assert.ok(center.includes("key: '" + code + "'"), 'Falta categoría de certificación ' + code)
}
assert.ok(center.includes(".eq('environment', 'test')"), 'La evidencia no debe mezclar entornos')
assert.ok(center.includes("['PROCESSED', 'INVALIDATED']"), 'Preservar evidencia de DTE posteriormente invalidado')
assert.ok(center.includes(".eq('status', 'PROCESSED')"), 'Eventos solo aceptados por Hacienda')
assert.ok(center.includes("{ head: true, count: 'exact' }"), 'Contar desde BD con exactitud')
assert.ok(!center.includes('/api/dte/transmit-test'), 'El centro no debe transmitir documentos automáticamente')
assert.ok(!center.includes('/api/dte/transmit-production'), 'El centro no debe operar en producción')
assert.ok(center.includes("onPrepareInvoice?.(requirement.key.slice(4))"), 'Conectar el tipo de documento seleccionado')
assert.ok(launcher.includes('<MhCertificationCenter'), 'Conectar centro dentro de Facturación > Hacienda')
assert.ok(launcher.includes('initialDteType={certificationDteType}'), 'El tipo del plan debe llegar al formulario')
assert.ok(invoice.includes("useState(initialDteType==='03'?'03':'01')"), 'El formulario debe respetar DTE-03 solicitado')
console.log('Auditoría MH certificación OK: evidencia MH TEST, navegación DTE-01/03, sin transmisión automática.')
