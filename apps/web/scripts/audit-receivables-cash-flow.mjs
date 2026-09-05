import fs from 'node:fs'

const ui=fs.readFileSync(new URL('../src/DeliveryFinanceModules.jsx',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/20260823175500_receivables_cash_safe.sql',import.meta.url),'utf8')

const checks=[
  ['CxC vinculada al DTE',migration.includes('dte_document_id')&&migration.includes('accounts_receivable_dte_uidx')],
  ['solo DTE procesado',migration.includes("new.status <> 'PROCESSED'")],
  ['solo operación a crédito',migration.includes('condicionOperacion')&&migration.includes('v_condition<>2')],
  ['sincronización DTE a CxC',migration.includes('sync_dte_to_receivable')&&migration.includes('trg_sync_dte_to_receivable')],
  ['pago selecciona caja',migration.includes('cash_account_id')&&ui.includes('Caja / banco *')],
  ['idempotencia de cobro',migration.includes('payment_key')&&migration.includes('customer_payments_company_key_uidx')],
  ['RPC de cobro',migration.includes('register_customer_payment')&&ui.includes("rpc('register_customer_payment'")],
  ['entrada de caja por cobro',migration.includes("'INCOME','CUSTOMER_PAYMENT'")&&migration.includes('cash_movements_customer_payment_uidx')],
  ['protección doble clic',ui.includes('if (busy) return')&&ui.includes('disabled={busy||!accounts.length}')],
  ['clave se renueva tras éxito',/payment_key\s*:\s*newKey\(\)/.test(ui)],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('DTE → CxC → Caja incompleto:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`DTE → CxC → Caja OK · ${checks.length} controles`)
