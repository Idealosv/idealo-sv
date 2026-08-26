import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const ui=fs.readFileSync(new URL('../../web/src/FinancialDashboard.jsx',import.meta.url),'utf8')
test('reportes usan fecha local y no UTC',()=>{assert.doesNotMatch(ui,/toISOString\(\)\.slice\(0,10\)/);assert.match(ui,/getFullYear\(\)/)})
test('liquidez incluye flujo de efectivo real del periodo',()=>{assert.match(ui,/Entradas de efectivo/);assert.match(ui,/Salidas de efectivo/);assert.match(ui,/FLUJO NETO DEL PERIODO/);assert.match(ui,/cashIn-cashOut/)})
test('CxC y CxP excluyen anuladas VOID',()=>{assert.match(ui,/\['PAID','CANCELLED','VOID'\]/)})
test('reportes permiten exportar información gerencial',()=>{assert.match(ui,/Exportar CSV/);assert.match(ui,/text\/csv/);assert.match(ui,/reporte-financiero-/)})
test('rango de fechas evita fin anterior al inicio',()=>{assert.match(ui,/type="date" value=\{to\} min=\{from\}/)})
