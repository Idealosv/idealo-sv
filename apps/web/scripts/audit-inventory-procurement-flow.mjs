import fs from 'node:fs'

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const panel=read('src/ProcurementSuggestionsPanel.jsx')
const launcher=read('src/OperationsFinanceLauncher.jsx')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823172000_inventory_procurement_sync.sql',import.meta.url),'utf8')

const checks=[
  ['vista de sugerencias',migration.includes('inventory_procurement_suggestions')],
  ['rpc preparar compra',migration.includes('prepare_inventory_purchase')],
  ['rpc recibir compra',migration.includes('receive_inventory_purchase')],
  ['entrada PURCHASE_IN',migration.includes("'PURCHASE_IN'")],
  ['proveedor principal',migration.includes('supplier_id')],
  ['faltante de OT',migration.includes('production_shortage')],
  ['panel usa sugerencias',panel.includes("from('inventory_procurement_suggestions')")],
  ['panel prepara compra',panel.includes("rpc('prepare_inventory_purchase'")],
  ['panel recibe inventario',panel.includes("rpc('receive_inventory_purchase'")],
  ['launcher monta panel',launcher.includes('<ProcurementSuggestionsPanel')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('Inventario → Compras incompleto:',failed.map(([n])=>n).join(', '));process.exit(1)}
console.log(`Inventario → Compras OK · ${checks.length} controles`)
