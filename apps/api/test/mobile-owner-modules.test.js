import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const hub=fs.readFileSync(new URL('../../web/src/MobileOwnerHub.jsx',import.meta.url),'utf8')
const host=fs.readFileSync(new URL('../../web/src/MobileOwnerHubHost.jsx',import.meta.url),'utf8')
const main=fs.readFileSync(new URL('../../web/src/main.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../../web/src/mobile-owner-hub.css',import.meta.url),'utf8')

test('centro Android usa fuentes reales del ERP para propietario',()=>{
 for(const source of ['finished_products','inventory_items','cash_account_balances','cash_movements','financial_cash_monthly','financial_receivables_summary','financial_payables_summary','financial_reconciliation_summary','dte_documents']) assert.match(hub,new RegExp(source))
})

test('centro móvil expone productos inventario caja reportes y DTE sin abrir escritorio',()=>{
 for(const label of ['Productos','Inventario','Caja','Reportes','Facturación / DTE']) assert.match(hub,new RegExp(label))
 assert.match(hub,/mobile-dte-fab/)
 assert.doesNotMatch(hub,/window\.location.*workspace/i)
})

test('centro propietario está integrado al runtime móvil con interfaz Android',()=>{
 assert.match(main,/MobileOwnerHubHost/)
 assert.match(main,/mobile-owner-hub\.css/)
 assert.match(host,/\['owner','admin'\]/)
 assert.match(css,/mobile-owner-panel/)
 assert.match(css,/safe-area-inset-bottom/)
})

test('módulos del propietario conservan lectura offline mediante caché local',()=>{
 assert.match(hub,/localStorage\.setItem/)
 assert.match(hub,/localStorage\.getItem/)
 assert.match(hub,/Sin conexión/)
})
