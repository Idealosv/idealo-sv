import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync(new URL('../../../supabase/migrations/20260826223000_financial_reporting_core.sql',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('../../web/src/FinancialReportsCenter.jsx',import.meta.url),'utf8')
test('flujo excluye transferencias internas',()=>assert.match(sql,/source_type<>'CASH_TRANSFER'/i))
test('vistas conservan RLS con security invoker',()=>assert.equal((sql.match(/security_invoker=true/g)||[]).length,4))
test('incluye CxC CxP y conciliación',()=>{assert.match(sql,/financial_receivables_summary/);assert.match(sql,/financial_payables_summary/);assert.match(sql,/financial_reconciliation_summary/)})
test('centro ejecutivo usa snapshot conciliado, rango y exportación',()=>{assert.match(ui,/financial_dashboard_snapshot/);assert.match(ui,/Exportar CSV/);assert.match(ui,/Control de integridad/);assert.match(ui,/Desde/);assert.match(ui,/Hasta/)})
