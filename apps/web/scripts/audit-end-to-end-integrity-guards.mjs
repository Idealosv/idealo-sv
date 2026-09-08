import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relativePath) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
const migration = read('../../../supabase/migrations/20260908082501_end_to_end_integrity_repair.sql')
const mobileDelivery = read('../../../supabase/migrations/20260905103000_mobile_delivery_confirmation.sql')

const normalized = migration.replace(/\s+/g, ' ').toLowerCase()
const mobileNormalized = mobileDelivery.replace(/\s+/g, ' ').toLowerCase()
const failures = []
const check = (name, condition) => {
  if (condition) console.log(`✓ ${name}`)
  else {
    console.error(`✗ ${name}`)
    failures.push(name)
  }
}

check('Entrega histórica se distingue sin inventar modalidad real', normalized.includes("'historical'::text"))
check('OTs entregadas legacy recuperan registro de entrega', normalized.includes('insert into public.deliveries') && normalized.includes("where w.status = 'delivered'"))
check('Base exige entrega antes de cerrar OT', normalized.includes('create or replace function public._erp_require_delivery_before_delivered()'))
check('Trigger protege transición a DELIVERED', normalized.includes('create trigger trg_work_orders_require_delivery'))
check('Guardia no queda ejecutable por authenticated', normalized.includes('revoke all on function public._erp_require_delivery_before_delivered() from authenticated'))
check('Estados finales DTE legacy recuperan trazabilidad', normalized.includes("d.status in ('processed','rejected')") && normalized.includes("'integrity_backfill'"))
check('Backfill DTE no duplica el mismo estado final', normalized.includes('where h.dte_document_id = d.id') && normalized.includes('and h.to_status = d.status'))

const deliveryInsert = mobileNormalized.indexOf('insert into public.deliveries')
const workOrderUpdate = mobileNormalized.indexOf('update public.work_orders')
check('Confirmación móvil registra entrega antes de marcar la OT entregada', deliveryInsert >= 0 && workOrderUpdate > deliveryInsert)

if (failures.length) {
  console.error(`\nAuditoría de integridad punta a punta falló: ${failures.join('; ')}`)
  process.exit(1)
}

console.log('OK integridad punta a punta: Entrega → OT y estados finales DTE quedan trazables y protegidos.')
