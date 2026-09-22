import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const dashboard=read('apps/web/src/PrestaditosDashboardPanel.jsx')
const css=read('apps/web/src/prestaditos-dashboard.css')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')

test('dashboard ejecutivo usa colores semánticos y seis KPIs',()=>{
 for(const label of ['Inversionistas','Capital activo','Solicitudes pendientes','Referencia anual','Rendimientos pagados','Próximo vencimiento'])assert.match(dashboard,new RegExp(label))
 for(const tone of ['blue','red','orange','indigo','green','purple'])assert.match(dashboard,new RegExp(`tone="${tone}"`))
 assert.match(css,/\.prst-dash-kpis\{display:grid;grid-template-columns:repeat\(3/)
 assert.match(css,/\.prst-dash-kpi\.red:before,\.prst-dash-kpi\.red:after/)
 assert.match(css,/\.prst-dash-kpi\.green:before,\.prst-dash-kpi\.green:after/)
})

test('dashboard muestra alertas flujo solicitudes vencimientos y resumen financiero',()=>{
 for(const phrase of ['ALERTAS OPERATIVAS','OPERACIÓN','Solicitudes recientes','Próximos vencimientos','Capital vigente por tasa anual','Situación de inversiones','RESUMEN FINANCIERO'])assert.match(dashboard,new RegExp(phrase))
 assert.match(dashboard,/excluye pagos revertidos/)
 assert.match(dashboard,/no inventa prorrateos ni capitalización/)
})

test('dashboard excluye pagos revertidos y calcula referencia anual desde tasa registrada',()=>{
 assert.match(dashboard,/\(payment\.status\|\|'POSTED'\)==='POSTED'/)
 assert.match(dashboard,/Number\(row\.principal\|\|0\)\*Number\(row\.agreed_return_rate\|\|0\)\/100/)
})

test('dashboard nuevo está montado tanto en host real como en vista previa',()=>{
 assert.match(host,/import PrestaditosDashboardPanel/)
 assert.match(host,/tab==='Dashboard'&&<PrestaditosDashboardPanel/)
 assert.match(preview,/import PrestaditosDashboardPanel/)
 assert.match(preview,/tab==='Dashboard'&&<PrestaditosDashboardPanel/)
})

test('dashboard se adapta a escritorio tablet y móvil',()=>{
 assert.match(css,/@media\(max-width:1380px\)/)
 assert.match(css,/@media\(max-width:1080px\)/)
 assert.match(css,/@media\(max-width:720px\)/)
 assert.match(css,/@media\(max-width:460px\)/)
 assert.match(css,/grid-template-columns:1fr 1fr/)
})


test('dashboard cyber mantiene estética tecnológica sin sacrificar legibilidad',()=>{
 assert.match(css,/CYBER EXECUTIVE DASHBOARD/)
 assert.match(css,/--cyber-cyan:#32d9ff/)
 assert.match(css,/background-image:[\s\S]*linear-gradient\(rgba\(70,190,230/)
 assert.match(css,/box-shadow:0 0 10px rgba\(50,217,255,.55\)/)
 assert.match(css,/Centro de control|cyber/i)
})
