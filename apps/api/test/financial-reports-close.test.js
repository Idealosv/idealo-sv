import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync(new URL('../../../supabase/migrations/20260826223000_financial_reports_close.sql',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('../../web/src/FinancialReportsPanel.jsx',import.meta.url),'utf8')
test('reporte financiero exige empresa y rango válido',()=>{assert.match(sql,/is_company_member\(p_company\)/i);assert.match(sql,/p_from>p_to/i)})
test('flujo de caja excluye transferencias internas al contar ingresos y gastos',()=>{assert.match(sql,/movement_type='INCOME'/i);assert.match(sql,/movement_type='EXPENSE'/i);assert.doesNotMatch(sql,/movement_type in \('INCOME','TRANSFER_IN'\)/i)})
test('CxC y CxP usan saldo pendiente real',()=>{assert.match(sql,/amount_total-amount_paid/i);assert.match(sql,/accounts_receivable/i);assert.match(sql,/accounts_payable/i)})
test('auditoría financiera detecta caja negativa, diferencias y vencidos',()=>{for(const x of ['NEGATIVE_CASH','RECONCILIATION_DIFFERENCE','OVERDUE_RECEIVABLE','OVERDUE_PAYABLE'])assert.match(sql,new RegExp(x))})
test('vista de alertas respeta RLS del invocador',()=>assert.match(sql,/security_invoker=true/i))
test('panel permite rango, actualización y exportación',()=>{assert.match(ui,/financial_report_summary/);assert.match(ui,/Exportar CSV/);assert.match(ui,/financial_integrity_alerts/)})
