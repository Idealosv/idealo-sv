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
 assert.match(css,/\.prst-dash-kpi\.red:before/)
 assert.match(css,/\.prst-dash-kpi\.green:before/)
})

test('dashboard muestra alertas flujo solicitudes vencimientos y resumen financiero',()=>{
 for(const phrase of ['ALERTAS OPERATIVAS','OPERACIÓN','Solicitudes recientes','Próximos vencimientos','Capital vigente por tasa anual','Situación de inversiones'])assert.match(dashboard,new RegExp(phrase))
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




test('dashboard usa estética financiera ejecutiva sin neón ni grid cyber',()=>{
 assert.match(css,/EXECUTIVE FINANCIAL DASHBOARD/)
 assert.match(css,/--exec-navy:#17202b/)
 assert.match(css,/background:#fff!important/)
 assert.match(dashboard,/Panel ejecutivo/)
 assert.doesNotMatch(css,/CYBER EXECUTIVE DASHBOARD/)
 assert.doesNotMatch(css,/--cyber-cyan/)
})


test('dashboard usa tipografía ejecutiva grande y legible',()=>{
 assert.match(css,/DASHBOARD EJECUTIVO LIMPIO Y LEGIBLE/)
 assert.match(css,/DASHBOARD COMPACT PREMIUM SCALE/)
 assert.match(css,/prst-dash-kpi strong\{[\s\S]*font-size:23px!important/)
 assert.match(css,/prst-dash-panel>header h3\{[\s\S]*font-size:23px!important/)
 assert.match(css,/prst-dash-alert-list strong\{[\s\S]*font-size:13px!important/)
 assert.match(css,/prst-dash-flow strong[\s\S]*font-size:13px!important/)
 assert.match(css,/prst-dash-list strong[\s\S]*font-size:13px!important/)
 assert.doesNotMatch(dashboard,/prst-dash-financial/)
})


test('dashboard reduce saturación visual y limita listas operativas',()=>{
 assert.match(dashboard,/\.slice\(0,3\)/)
 assert.doesNotMatch(dashboard,/prst-dash-financial/)
 assert.match(css,/gap:16px!important/)
 assert.match(css,/font-size:35px!important/)
})


test('dashboard aísla botones de estilos globales oscuros',()=>{
 assert.match(css,/DASHBOARD BUTTON RESET · KEEP CARDS LIGHT/)
 assert.match(css,/button\.prst-dash-kpi\{[\s\S]*background:#fff!important/)
 assert.match(css,/\.prst-dash-flow>button\{[\s\S]*background:#f8fafc!important/)
 assert.match(css,/\.prst-dash-list>button\{[\s\S]*background:#f8fafc!important/)
 assert.match(css,/\.prst-dash-alert-list>button\{[\s\S]*background:#f8fafc!important/)
})


test('dashboard usa escala premium compacta sin perder legibilidad',()=>{
 assert.match(css,/DASHBOARD COMPACT PREMIUM SCALE/)
 assert.match(css,/min-height:142px!important/)
 assert.match(css,/font-size:35px!important/)
 assert.match(css,/min-height:104px!important/)
 assert.match(css,/font-size:23px!important/)
 assert.match(css,/padding:18px!important/)
})
