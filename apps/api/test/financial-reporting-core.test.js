import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync(new URL('../../../supabase/migrations/20260826223000_financial_reporting_core.sql',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('../../web/src/FinancialReportsCenter.jsx',import.meta.url),'utf8')
test('flujo excluye transferencias internas para no inflar ingresos y gastos',()=>{assert.match(sql,/source_type<>'CASH_TRANSFER'/i)})
test('reportes usan security invoker y aislamiento heredado por RLS',()=>{assert.equal((sql.match(/security_invoker=true/g)||[]).length,4)})
test('incluye CxC, CxP y conciliaciones',()=>{assert.match(sql,/financial_receivables_summary/);assert.match(sql,/financial_payables_summary/);assert.match(sql,/financial_reconciliation_summary/)})
test('centro ejecutivo compara meses y permite exportar',()=>{assert.match(ui,/mes anterior/);assert.match(ui,/Exportar CSV/);assert.match(ui,/Control de integridad/)})
