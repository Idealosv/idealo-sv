import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), '../..')
const migrationPath = path.join(root, 'supabase/migrations/20260823170500_production_inventory_sync.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'reservation_id uuid references public.inventory_reservations',
  'sync_production_material_inventory()',
  "'PRODUCTION_OUT'",
  'consume_work_order_inventory_on_production()',
  "cost_type in ('MATERIAL'",
  "'PRODUCTION_MATERIAL'",
  'refresh_inventory_reserved_stock',
  "new.status='PRODUCTION'",
]

for (const token of required) {
  if (!sql.includes(token)) throw new Error(`Producción → Inventario incompleto: falta ${token}`)
}

if (!sql.includes('Stock insuficiente para reservar')) {
  throw new Error('La reserva de producción debe impedir sobre-reservar inventario.')
}
if (!sql.includes('on conflict (work_order_id,source_type,source_id)')) {
  throw new Error('El costo de material debe ser idempotente por requisito de producción.')
}

console.log('Auditoría Producción → Inventario: OK')
