import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const panel = read('src/ProcessedDtePanel.jsx')
const recovery = read('src/RejectedDteRecovery.jsx')
const service = read('../api/src/dte/invoice-service.js')
const migration = read('../../supabase/migrations/20260824140000_dte_reissue_traceability.sql')

const checks = [
  ['Documentos expone recuperación solo para REJECTED', panel.includes("selected?.status === 'REJECTED'") && panel.includes('RejectedDteRecovery')],
  ['La recuperación no retransmite el rechazado', !recovery.includes('/api/dte/transmit-test') && recovery.includes('/api/dte/invoices')],
  ['El nuevo DTE registra el documento rechazado de origen', recovery.includes('reissuedFromId: document.id') && service.includes('reissued_from_id: rejectedSource?.id || null')],
  ['Backend exige origen REJECTED', service.includes("data.status !== 'REJECTED'")],
  ['Backend conserva tipo y receptor', service.includes('String(data.dte_type) !== type') && service.includes('(data.client_id || null) !== (clientId || null)')],
  ['La base conserva vínculo al rechazado', migration.includes('reissued_from_id uuid references public.dte_documents(id) on delete set null')],
  ['La base evita más de una reemisión activa', migration.includes('dte_documents_one_active_reissue_uidx')],
  ['La UI muestra observaciones MH', panel.includes('mh.observaciones')],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failed += 1
}
if (failed) process.exit(1)
console.log('Auditoría rechazo → corrección/reemisión DTE: OK')
