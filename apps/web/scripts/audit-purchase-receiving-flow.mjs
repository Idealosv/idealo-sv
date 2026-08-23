import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../src/OperationsFinanceLauncher.jsx',import.meta.url),'utf8')
const module=fs.readFileSync(new URL('../src/PurchaseReceivingModule.jsx',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823174000_purchase_receiving_inventory.sql',import.meta.url),'utf8')
const required=[
  ['pestaña Recepciones',launcher.includes("'Recepciones'")&&launcher.includes('PurchaseReceivingModule')],
  ['consulta de partidas',module.includes('purchase_items(')&&module.includes('received_quantity')],
  ['confirmación de orden',module.includes("rpc('confirm_purchase_order'")],
  ['recepción transaccional',module.includes("rpc('receive_purchase_item'")],
  ['movimiento PURCHASE_IN',migration.includes("'PURCHASE_IN'")],
  ['idempotencia',migration.includes('receipt_key')&&migration.includes('unique(company_id,receipt_key)')],
  ['estado parcial/total',migration.includes("'PARTIAL_RECEIVED'")&&migration.includes("'RECEIVED'")],
  ['elimina trigger duplicado',migration.includes('drop trigger if exists trg_apply_inventory_movement')],
  ['costo y stock',migration.includes('unit_cost')&&migration.includes('inventory_movements')],
]
const failed=required.filter(([,ok])=>!ok)
if(failed.length){console.error('Auditoría Compra → Recepción → Inventario falló:',failed.map(([n])=>n).join(', '));process.exit(1)}
console.log('Auditoría Compra → Recepción → Inventario OK')
