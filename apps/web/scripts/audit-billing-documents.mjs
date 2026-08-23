import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const panel = await readFile(resolve(src, 'ProcessedDtePanel.jsx'), 'utf8')
const launcher = await readFile(resolve(src, 'FacturacionLauncher.jsx'), 'utf8')
const main = await readFile(resolve(src, 'main.jsx'), 'utf8')
const failures = []

for (const token of [".in('dte_type', ['01', '03'])", "statusLabel", "'/api/dte/sign-test'", "'/api/dte/transmit-test'", 'Firmar DTE', 'Enviar a Hacienda TEST', 'Ver / imprimir']) {
  if (!panel.includes(token)) failures.push(`Falta control de Facturas: ${token}`)
}
if (!panel.includes("document.status === 'DRAFT'")) failures.push('La firma debe limitarse a DRAFT')
if (!panel.includes("document.status === 'SIGNED'")) failures.push('La transmisión debe limitarse a SIGNED')
if (!launcher.includes('session={session}') || !launcher.includes("selectSection('hacienda')")) failures.push('Facturas no está conectado con sesión/Hacienda')
if (!main.includes("'./billing-documents.css'")) failures.push('Falta la capa visual de Facturas y estados')
if (panel.includes(".eq('status', 'PROCESSED')") || panel.includes('.limit(1)')) failures.push('Facturas volvió a limitarse al último documento procesado')

if (failures.length) {
  console.error('\nAuditoría Facturas y estados falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría Facturas y estados OK: historial DTE-01/DTE-03, firma, transmisión TEST, detalle y representación protegidos.')
