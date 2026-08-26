import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const migrationsDir=path.resolve(here,'../../../supabase/migrations')
const sql=fs.readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync(path.join(migrationsDir,x),'utf8')).join('\n')

const required=[
 ['DTE aceptado -> CxC','sync_dte_to_receivable'],
 ['Cobro -> Caja','apply_customer_payment_cash'],
 ['Recalculo CxC','refresh_receivable_balance'],
 ['Cobro seguro','register_customer_payment'],
 ['Reversion controlada','reverse_customer_payment'],
 ['Compra -> CxP','sync_purchase_to_payable'],
 ['Pago proveedor -> Caja','apply_supplier_payment'],
 ['Pago proveedor seguro','register_supplier_payment'],
 ['Recepcion compra -> Inventario','receive_purchase_item'],
 ['Movimiento de inventario','apply_inventory_movement'],
 ['Produccion consume inventario','consume_work_order_inventory_on_production'],
 ['Transferencia bancaria','register_cash_transfer'],
 ['Cierre diario','close_cash_day'],
 ['Cierre conciliacion','close_cash_reconciliation'],
 ['DTE procesado inmutable','guard_processed_dte_immutability'],
 ['Cobro aplicado inmutable','guard_customer_payment_immutability'],
 ['Seguridad sin TRUNCATE','revoke truncate'],
 ['Reportes flujo','financial_cash_monthly'],
 ['Reportes CxC','financial_receivables_summary'],
 ['Reportes CxP','financial_payables_summary'],
 ['Reportes conciliacion','financial_reconciliation_summary'],
]

for(const [name,token] of required){
 test(`flujo maestro: ${name}`,()=>assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')))
}

test('flujo maestro: caja no duplica cobros',()=>{
 assert.match(sql,/cash_movements_customer_payment_uidx/i)
 assert.match(sql,/on conflict \(company_id,source_type,source_id\)[\s\S]*do nothing/i)
})

test('flujo maestro: cobros y pagos bloquean sobrepago',()=>{
 assert.match(sql,/p_amount>v_balance\+0\.001/i)
 assert.match(sql,/saldo pendiente|supera el saldo|excede el saldo/i)
})

test('flujo maestro: transferencias internas no inflan reportes',()=>{
 assert.match(sql,/source_type<>'CASH_TRANSFER'/i)
})
