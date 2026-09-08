import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../src/OperationsFinanceLauncher.jsx',import.meta.url),'utf8')
const receiving=fs.readFileSync(new URL('../src/PurchaseReceivingModule.jsx',import.meta.url),'utf8')
const baseMigration=fs.readFileSync(new URL('../../../supabase/migrations/20260823173000_procurement_receiving_unification.sql',import.meta.url),'utf8')
const safeMigration=fs.readFileSync(new URL('../../../supabase/migrations/20260823174000_purchase_receiving_inventory.sql',import.meta.url),'utf8')

const checks=[
  ['estado REGISTERED permitido',baseMigration.includes("'REGISTERED','DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED','CANCELLED'")],
  ['compras manuales default REGISTERED',baseMigration.includes("set default 'REGISTERED'")],
  ['vista descuenta compra abierta',baseMigration.includes('open_purchase_qty')],
  ['recepción genera PURCHASE_IN',safeMigration.includes("'PURCHASE_IN'")],
  ['rpc parcial de recepción',safeMigration.includes('receive_purchase_item')],
  ['recepción exige ORDERED',safeMigration.includes("not in ('ORDERED','PARTIAL_RECEIVED')")],
  ['idempotencia por receipt_key',safeMigration.includes('receipt_key')&&safeMigration.includes('unique(company_id,receipt_key)')],
  ['evita sobre recepción',safeMigration.includes('p_quantity>v_remaining')],
  ['elimina trigger duplicado',safeMigration.includes('drop trigger if exists trg_apply_inventory_movement')],
  ['launcher incluye Recepción',launcher.includes("'Recepción'")&&launcher.includes('<PurchaseReceivingModule')],
  ['UI marca ordenada con RPC',receiving.includes("rpc('confirm_purchase_order'")],
  ['UI recibe por partida',receiving.includes("rpc('receive_purchase_item'")],
  ['UI permite parcialidad',receiving.includes('Recibir ahora')&&receiving.includes('pendiente')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('Reposición → recepción incompleta:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`Reposición → Compra → Recepción parcial OK · ${checks.length} controles`)
