import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const ui=fs.readFileSync(new URL('../../web/src/FinancialDashboard.jsx',import.meta.url),'utf8')
const launcher=fs.readFileSync(new URL('../../web/src/FinancialDashboardLauncher.jsx',import.meta.url),'utf8')
test('reportes usan fecha local y no UTC',()=>{assert.doesNotMatch(ui,/toISOString\(\)\.slice\(0,10\)/);assert.match(ui,/getFullYear\(\)/)})
test('cobros netos descuentan reversiones',()=>{assert.match(ui,/customer_payment_reversals/);assert.match(ui,/collections=grossCollections-reversed/)})
test('liquidez incorpora flujo de efectivo real',()=>{assert.match(ui,/FLUJO DE EFECTIVO/);assert.match(ui,/cashIn/);assert.match(ui,/cashOut/);assert.match(ui,/netCash/)})
test('cuentas anuladas no contaminan CxC ni CxP',()=>{assert.match(ui,/\['PAID','CANCELLED','VOID'\]/)})
test('reportes permiten exportar y generar PDF por impresión',()=>{assert.match(ui,/Exportar CSV/);assert.match(ui,/window\.print\(\)/);assert.match(ui,/text\/csv/)})
test('launcher conserva resultados liquidez rentabilidad y conciliación',()=>{for(const tab of ['Resultados','Liquidez','Rentabilidad','Conciliación'])assert.match(launcher,new RegExp(tab))})
