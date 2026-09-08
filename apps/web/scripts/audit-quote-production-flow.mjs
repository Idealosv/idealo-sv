import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const root = resolve(here, '../../..')
const quotes = await readFile(resolve(src, 'Quotes360Module.jsx'), 'utf8')
const production = await readFile(resolve(src, 'Production360Module.jsx'), 'utf8')
const migration = await readFile(resolve(root, 'supabase/migrations/20260823170000_quote_to_production_integrity.sql'), 'utf8')

const failures = []
const expect = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

expect(quotes, "['APPROVED','PARTIALLY_CONVERTED']", 'La conversión debe exigir una cotización aprobada.')
expect(quotes, "supabase.from('work_orders').insert", 'Cotizaciones debe crear una orden de trabajo.')
expect(quotes, "supabase.from('work_order_items').insert", 'Cotizaciones debe crear partidas de la orden.')
expect(quotes, 'converted_quantity', 'La conversión debe proteger cantidades ya convertidas.')
expect(production, "supabase.from('work_orders').select('*,clients(name,phone),work_order_items(*)')", 'Producción debe cargar las partidas completas de la orden.')
expect(production, "supabase.from('production_tasks')", 'Producción debe consumir la ruta de procesos.')

for (const token of [
  'idealo_enrich_work_order_from_quote',
  'new.priority',
  'new.installation_required',
  'new.installation_address',
  'new.estimated_cost',
  'idealo_enrich_work_order_item_from_quote',
  'new.variant_id',
  'new.sku',
  'new.unit_cost',
  'new.labor_unit_cost',
  'new.installation_unit_cost',
  'new.estimated_minutes',
  'new.requires_production',
  'new.source_quote_item_id',
  'idealo_create_production_task_from_order_item',
  "insert into public.production_tasks"
]) expect(migration, token, `La migración de integridad no protege ${token}.`)

if (failures.length) {
  console.error('\nAuditoría Cotización → Producción falló:')
  failures.forEach(f => console.error(`- ${f}`))
  process.exit(1)
}

console.log('Auditoría Cotización → Producción OK: aprobación, cantidades, OT, partidas, costos, variante, instalación y ruta productiva protegidos.')
