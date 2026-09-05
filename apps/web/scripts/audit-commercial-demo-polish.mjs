import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const read=(file)=>fs.readFileSync(path.resolve(here,file),'utf8')
const clientsCss=read('../src/client-module-organizer.css')
const productsCss=read('../src/products-360-simple.css')
const quotes=read('../src/QuotesQuickModule.jsx')
const quotesCss=read('../src/quotes-quick.css')
const production=read('../src/ProductionControlCenter.jsx')
const production360=read('../src/Production360Module.jsx')
const productionCss=read('../src/production-simple.css')
const billing=read('../src/Billing360Dashboard.jsx')
const dashboard=read('../src/ExecutiveDashboardHost.jsx')

const checks=[
 ['clientes reduce ruido durante edición',clientsCss.includes('.client-form-open .client-stats')&&clientsCss.includes('.client-form-open .clients-directory')],
 ['clientes conserva CTA primario de guardado',clientsCss.includes('button[type=submit]')&&clientsCss.includes('#f36c21')],
 ['clientes tiene navegación organizada y responsive',clientsCss.includes('.client-organizer-tabs')&&clientsCss.includes('@media(max-width:760px)')],
 ['productos presenta resumen ejecutivo compacto',productsCss.includes('.products360-summary')&&productsCss.includes('.product360-quick-profit')],
 ['productos separa catálogo y editor con jerarquía',productsCss.includes('.products360-list-panel')&&productsCss.includes('.products360-editor')&&productsCss.includes('.products360-savebar')],
 ['productos mantiene adaptación móvil',productsCss.includes('@media(max-width:620px)')&&productsCss.includes('grid-template-columns:1fr')],
 ['cotizaciones bloquea acciones concurrentes',quotes.includes("[actionBusy,setActionBusy]")&&quotes.includes("const locked=Boolean(busy||actionBusy)")],
 ['cotizaciones convierte OT mediante RPC atómico',quotes.includes("rpc('convert_quote_to_work_order'")&&quotes.includes("p_quote_id:form.id")],
 ['cotizaciones informa idempotencia sin duplicar',quotes.includes('data?.existing')&&quotes.includes('No se creó un duplicado')],
 ['botón crear orden informa progreso',quotes.includes('Creando orden…')&&quotes.includes("disabled={locked}")],
 ['lista de cotizaciones distingue cero datos de cero coincidencias',quotes.includes('Todavía no hay cotizaciones.')&&quotes.includes('No encontramos coincidencias.')],
 ['cotizaciones mantiene recorrido visual por pasos',quotesCss.includes('.qq-step-number')&&quotesCss.includes('.qq-actions')&&quotesCss.includes('.qq-total .grand')],
 ['producción refresca sin vaciar el tablero',production.includes('[refreshing,setRefreshing]')&&production.includes("refreshing?'Actualizando…':'Actualizar'")],
 ['producción presenta estado vacío de próximas salidas',production.includes('Sin entregas próximas')&&production.includes('La agenda de producción está despejada.')],
 ['producción 360 permite buscar OT cliente o trabajo',production360.includes('Buscar OT, cliente o trabajo')&&production360.includes('production-search')],
 ['producción 360 continúa a Entrega al quedar lista',production360.includes("if(next==='READY')")&&production360.includes("step:'delivery'")&&production360.includes('workOrderId:selected.id')],
 ['producción prioriza estado y detalle en demo',productionCss.includes('.production-job-head')&&productionCss.includes('.production-job-row')&&productionCss.includes('.production-stage-badge')],
 ['facturación diferencia éxito error y estado neutro',billing.includes("setActionMessage({type:'error'")&&billing.includes("setActionMessage({type:'success'")&&billing.includes("type:'neutral'")],
 ['facturación bloquea refresco concurrente',billing.includes('[refreshing,setRefreshing]')&&billing.includes("refreshing?'Actualizando…':'Actualizar'")],
 ['facturación explica ausencia de documentos',billing.includes('Todavía no hay documentos electrónicos.')],
 ['dashboard evita pantalla blanca mientras prepara empresa',dashboard.includes('Preparando el Dashboard ejecutivo…')&&dashboard.includes('loadingCompany')],
 ['dashboard muestra fallo amigable de carga',dashboard.includes('Dashboard temporalmente no disponible')&&dashboard.includes('Reintentá en unos segundos.')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('FALLA pulido comercial:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`OK pulido comercial de demo: ${checks.length} controles PASS.`)
