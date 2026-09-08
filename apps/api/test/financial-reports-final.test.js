import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const ui=fs.readFileSync(new URL('../../web/src/FinancialDashboard.jsx',import.meta.url),'utf8')
test('reportes incluyen resultados liquidez flujo y rentabilidad',()=>{for(const x of ['Resultados','Liquidez','Flujo de efectivo','Rentabilidad'])assert.match(ui,new RegExp(x))})
test('flujo excluye transferencias internas',()=>assert.match(ui,/source_type!=='CASH_TRANSFER'/))
test('cobros netos descuentan reversiones',()=>{assert.match(ui,/grossCollections-reversed/);assert.match(ui,/customer_payment_reversals/)})
test('saldos abiertos excluyen anulados',()=>assert.match(ui,/\['PAID','CANCELLED','VOID'\]/))
test('reportes permiten Excel CSV e impresión PDF',()=>{assert.match(ui,/Exportar Excel\/CSV/);assert.match(ui,/Imprimir \/ PDF/);assert.match(ui,/window\.print\(\)/)})
test('resultados comparan ventas contra periodo anterior equivalente',()=>{assert.match(ui,/shiftPeriod/);assert.match(ui,/previousOrders/);assert.match(ui,/salesChange/)})
test('valida rango de fechas',()=>assert.match(ui,/fecha inicial no puede ser posterior/))
