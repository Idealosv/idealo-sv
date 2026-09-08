import fs from 'node:fs'

const panel = fs.readFileSync(new URL('../src/InvoiceEmailPdfTestPanel.jsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../../api/src/index.js', import.meta.url), 'utf8')
const manager = fs.readFileSync(new URL('../../api/src/dte/invoice-email-management-service.js', import.meta.url), 'utf8')

const checks = [
  ['estado visible', panel.includes('Estado del correo del DTE')],
  ['botón reenvío', panel.includes('Reenviar correo al cliente')],
  ['confirmación sin MH', panel.includes('NO genera, firma ni retransmite el DTE a Hacienda')],
  ['endpoint estado', api.includes('/api/dte/invoice-email-status')],
  ['endpoint reenvío', api.includes('/api/dte/invoice-email-resend')],
  ['reenvío solo producción', manager.includes("document.environment!=='production'")],
  ['reenvío solo procesado', manager.includes("document.status!=='PROCESSED'")],
  ['registro manual', manager.includes("delivery_kind:'manual'")],
  ['respuesta sin transmisión', manager.includes('transmittedToMh:false')],
]
const failed = checks.filter(([, ok]) => !ok)
if (failed.length) {
  console.error('Auditoría de correo DTE falló:', failed.map(([name]) => name).join(', '))
  process.exit(1)
}
console.log(`Auditoría correo DTE OK (${checks.length} controles)`)
