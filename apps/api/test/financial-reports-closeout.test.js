import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const dashboard=fs.readFileSync(new URL('../../web/src/FinancialDashboard.jsx',import.meta.url),'utf8')
const launcher=fs.readFileSync(new URL('../../web/src/FinancialDashboardLauncher.jsx',import.meta.url),'utf8')
test('reportes usan fecha local y no UTC',()=>{assert.doesNotMatch(dashboard,/toISOString\(\)\.slice\(0,10\)/);assert.match(dashboard,/getFullYear\(\)/)})
test('cobros netos descuentan reversiones',()=>{assert.match(dashboard,/customer_payment_reversals/);assert.match(dashboard,/grossCollections-reversed/)})
test('flujo excluye transferencias internas',()=>{assert.match(dashboard,/source_type!==['"]CASH_TRANSFER['"]/);assert.match(launcher,/Flujo de efectivo/)})
test('reportes reconocen anulados VOID además de CANCELLED',()=>{assert.match(dashboard,/CANCELLED','VOID/)})
test('exportación incluye indicadores y rentabilidad por orden',()=>{assert.match(dashboard,/Exportar Excel\/CSV/);assert.match(dashboard,/idealo-reporte-/);assert.match(dashboard,/Costo real/)})
