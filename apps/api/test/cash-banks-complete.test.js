import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql=fs.readFileSync(new URL('../../../supabase/migrations/20260826220000_cash_banks_control_complete.sql',import.meta.url),'utf8')
const guards=fs.readFileSync(new URL('../../../supabase/migrations/20260826220500_cash_closure_guards.sql',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('../../web/src/CashReconciliationPanel.jsx',import.meta.url),'utf8')

test('transferencia crea salida y entrada y evita saldo insuficiente',()=>{
  assert.match(sql,/register_cash_transfer/i)
  assert.match(sql,/TRANSFER_OUT/i)
  assert.match(sql,/TRANSFER_IN/i)
  assert.match(sql,/Saldo insuficiente en la cuenta de origen/i)
  assert.match(sql,/from_account_id<>to_account_id/i)
})

test('ajuste exige motivo y evita disminución por encima del saldo',()=>{
  assert.match(sql,/register_cash_adjustment/i)
  assert.match(sql,/char_length\(trim\(coalesce\(p_reason,''\)\)\)<4/i)
  assert.match(sql,/El ajuste dejaría saldo negativo/i)
})

test('cierre diario guarda snapshot y congela movimientos del día',()=>{
  assert.match(sql,/cash_daily_closures/i)
  assert.match(sql,/close_cash_day/i)
  assert.match(guards,/before insert or update or delete on public\.cash_movements/i)
  assert.match(guards,/El día ya fue cerrado/i)
  assert.match(guards,/Un cierre diario es inmutable/i)
})

test('conciliación cerrada es inmutable y diferencia requiere explicación',()=>{
  assert.match(sql,/close_cash_reconciliation/i)
  assert.match(sql,/Explicá la diferencia antes de cerrar/i)
  assert.match(sql,/La conciliación cerrada es inmutable/i)
})

test('UI expone transferencias ajustes cierres y conciliación cerrada',()=>{
  assert.match(ui,/register_cash_transfer/)
  assert.match(ui,/register_cash_adjustment/)
  assert.match(ui,/close_cash_day/)
  assert.match(ui,/close_cash_reconciliation/)
  assert.doesNotMatch(ui,/toISOString\(\)\.slice\(0,10\)/)
})
