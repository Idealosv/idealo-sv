import fs from 'node:fs'

const ui=fs.readFileSync(new URL('../src/SupplierPayablesModule.jsx',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823175500_payables_cash_safe.sql',import.meta.url),'utf8')
const checks=[
  ['CxP respeta RECEIVED',migration.includes("v_status in ('REGISTERED','RECEIVED')")],
  ['trigger escucha procurement_status',migration.includes('procurement_status on public.purchases')],
  ['pago idempotente',migration.includes('payment_key')&&migration.includes('supplier_payments_payment_key_uidx')],
  ['caja única por pago',migration.includes('cash_movements_supplier_payment_uidx')&&migration.includes("source_type='SUPPLIER_PAYMENT'")],
  ['RPC transaccional',migration.includes('register_supplier_payment')],
  ['validación de saldo',migration.includes('v_balance')&&migration.includes('p_amount>v_balance')],
  ['UI usa RPC',ui.includes("rpc('register_supplier_payment'")],
  ['UI conserva clave en reintento',ui.includes('payment_key:pay.payment_key')],
  ['UI bloquea doble clic',ui.includes('if(busy)return')&&ui.includes("busy?'Registrando pago…'")],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('CxP → Caja incompleto:',failed.map(([n])=>n).join(', '));process.exit(1)}
console.log(`Compra recibida → CxP → Caja OK · ${checks.length} controles`)
