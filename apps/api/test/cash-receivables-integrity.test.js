import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const paymentSql=fs.readFileSync(new URL('../../../supabase/migrations/20260823175500_receivables_cash_safe.sql',import.meta.url),'utf8')
const baseSql=fs.readFileSync(new URL('../../../supabase/migrations/20260822120500_deliveries_receivables_payments.sql',import.meta.url),'utf8')
const guardSql=fs.readFileSync(new URL('../../../supabase/migrations/20260826210000_customer_payment_immutability.sql',import.meta.url),'utf8')
const reconciliationSql=fs.readFileSync(new URL('../../../supabase/migrations/20260823181000_cash_reconciliation_flow.sql',import.meta.url),'utf8')

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

test('conciliación calcula saldo hasta la fecha de corte',()=>{
  assert.match(reconciliationSql,/movement_date::date<=p_date/i)
  assert.match(reconciliationSql,/MATCHED.*DIFFERENCE/is)
})
