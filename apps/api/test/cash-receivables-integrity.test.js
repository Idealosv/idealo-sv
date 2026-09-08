import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const paymentSql=fs.readFileSync(new URL('../../../supabase/migrations/20260823175500_receivables_cash_safe.sql',import.meta.url),'utf8')
const baseSql=fs.readFileSync(new URL('../../../supabase/migrations/20260822120500_deliveries_receivables_payments.sql',import.meta.url),'utf8')
const guardSql=fs.readFileSync(new URL('../../../supabase/migrations/20260826210000_customer_payment_immutability.sql',import.meta.url),'utf8')
const reversalSql=fs.readFileSync(new URL('../../../supabase/migrations/20260826213000_customer_payment_reversals.sql',import.meta.url),'utf8')
const reconciliationSql=fs.readFileSync(new URL('../../../supabase/migrations/20260823181000_cash_reconciliation_flow.sql',import.meta.url),'utf8')
const cashUi=fs.readFileSync(new URL('../../web/src/CashControlCenter.jsx',import.meta.url),'utf8')

test('cobro usa llave idempotente y no duplica movimiento de caja',()=>{
  assert.match(paymentSql,/customer_payments_company_key_uidx/i)
  assert.match(paymentSql,/cash_movements_customer_payment_uidx/i)
  assert.match(paymentSql,/on conflict \(company_id,source_type,source_id\)[\s\S]*do nothing/i)
})

test('registro de cobro bloquea sobrepago y cuenta cerrada',()=>{
  assert.match(paymentSql,/status in \('PAID','CANCELLED'\)/i)
  assert.match(paymentSql,/p_amount>v_balance\+0\.001/i)
  assert.match(paymentSql,/for update/i)
})

test('saldo CxC se recalcula desde pagos aplicados',()=>{
  assert.match(baseSql,/sum\(amount\).*customer_payments/i)
  assert.match(baseSql,/after insert or update or delete on customer_payments/i)
})

test('cobro aplicado queda inmutable para evitar desincronizar Caja y CxC',()=>{
  assert.match(guardSql,/before update or delete on public\.customer_payments/i)
  assert.match(guardSql,/no se puede editar ni eliminar/i)
})

test('reversión conserva pago original y excluye cobro reversado del saldo CxC',()=>{
  assert.match(reversalSql,/create table if not exists public\.customer_payment_reversals/i)
  assert.match(reversalSql,/unique\(payment_id\)/i)
  assert.match(reversalSql,/not exists[\s\S]*customer_payment_reversals[\s\S]*payment_id=cp\.id/i)
})

test('reversión crea contrapartida única en Caja y no borra movimientos',()=>{
  assert.match(reversalSql,/CUSTOMER_PAYMENT_REVERSAL/i)
  assert.match(reversalSql,/movement_type,source_type[\s\S]*'EXPENSE','CUSTOMER_PAYMENT_REVERSAL'/i)
  assert.match(reversalSql,/cash_movements_customer_payment_reversal_uidx/i)
  assert.doesNotMatch(reversalSql,/delete from public\.cash_movements/i)
})

test('RPC de reversión exige motivo, membresía e idempotencia',()=>{
  assert.match(reversalSql,/reverse_customer_payment/i)
  assert.match(reversalSql,/Indicá el motivo de la reversión/i)
  assert.match(reversalSql,/is_company_member\(p\.company_id\)/i)
  assert.match(reversalSql,/payment_id=p_payment or reversal_key=p_reversal_key/i)
})

test('conciliación calcula saldo hasta la fecha de corte',()=>{
  assert.match(reconciliationSql,/movement_date::date<=p_date/i)
  assert.match(reconciliationSql,/MATCHED.*DIFFERENCE/is)
})

test('tablero diario de caja usa fecha local y no UTC',()=>{
  assert.doesNotMatch(cashUi,/toISOString\(\)\.slice\(0,10\)/)
  assert.match(cashUi,/getFullYear\(\)/)
  assert.match(cashUi,/day\(new Date\(x\.movement_date\)\)===t/)
})
