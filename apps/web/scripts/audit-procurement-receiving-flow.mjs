import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../src/OperationsFinanceLauncher.jsx',import.meta.url),'utf8')
const receiving=fs.readFileSync(new URL('../src/PurchaseReceivingModule.jsx',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823173000_procurement_receiving_unification.sql',import.meta.url),'utf8')

const checks=[
  ['estado REGISTERED permitido',migration.includes("'REGISTERED','DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED','CANCELLED'")],
  ['compras manuales default REGISTERED',migration.includes("set default 'REGISTERED'")],
  ['vista descuenta compra abierta',migration.includes('open_purchase_qty')],
  ['recepción genera PURCHASE_IN',migration.includes("'PURCHASE_IN'")],
  ['rpc de recepción',migration.includes('receive_inventory_purchase')],
  ['recepción exige ORDERED',migration.includes("not in ('ORDERED','PARTIAL_RECEIVED')")],
  ['launcher incluye Recepción',launcher.includes("'Recepción'")&&launcher.includes('<PurchaseReceivingModule')],
  ['UI marca ordenada',receiving.includes("setStatus(r,'ORDERED')")||receiving.includes("setStatus(row,'ORDERED')")],
  ['UI recibe inventario',receiving.includes("rpc('receive_inventory_purchase'")],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('Reposición → recepción incompleta:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`Reposición → Compra → Recepción OK · ${checks.length} controles`)
