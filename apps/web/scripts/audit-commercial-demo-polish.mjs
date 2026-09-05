import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const read=(file)=>fs.readFileSync(path.resolve(here,file),'utf8')
const quotes=read('../src/QuotesQuickModule.jsx')
const production=read('../src/ProductionControlCenter.jsx')
const billing=read('../src/Billing360Dashboard.jsx')
const dashboard=read('../src/ExecutiveDashboardHost.jsx')

const checks=[
 ['cotizaciones bloquea acciones concurrentes',quotes.includes("[actionBusy,setActionBusy]")&&quotes.includes("const locked=Boolean(busy||actionBusy)")],
 ['cotizaciones convierte OT mediante RPC atómico',quotes.includes("rpc('convert_quote_to_work_order'")&&quotes.includes("p_quote_id:form.id")],
 ['cotizaciones informa idempotencia sin duplicar',quotes.includes('data?.existing')&&quotes.includes('No se creó un duplicado')],
 ['botón crear orden informa progreso',quotes.includes('Creando orden…')&&quotes.includes("disabled={locked}")],
 ['lista de cotizaciones distingue cero datos de cero coincidencias',quotes.includes('Todavía no hay cotizaciones.')&&quotes.includes('No encontramos coincidencias.')],
 ['producción refresca sin vaciar el tablero',production.includes('[refreshing,setRefreshing]')&&production.includes("refreshing?'Actualizando…':'Actualizar'")],
 ['producción presenta estado vacío de próximas salidas',production.includes('Sin entregas próximas')&&production.includes('La agenda de producción está despejada.')],
 ['facturación diferencia éxito error y estado neutro',billing.includes("setActionMessage({type:'error'")&&billing.includes("setActionMessage({type:'success'")&&billing.includes("type:'neutral'")],
 ['facturación bloquea refresco concurrente',billing.includes('[refreshing,setRefreshing]')&&billing.includes("refreshing?'Actualizando…':'Actualizar'")],
 ['facturación explica ausencia de documentos',billing.includes('Todavía no hay documentos electrónicos.')],
 ['dashboard evita pantalla blanca mientras prepara empresa',dashboard.includes('Preparando el Dashboard ejecutivo…')&&dashboard.includes('loadingCompany')],
 ['dashboard muestra fallo amigable de carga',dashboard.includes('Dashboard temporalmente no disponible')&&dashboard.includes('Reintentá en unos segundos.')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('FALLA pulido comercial:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`OK pulido comercial de demo: ${checks.length} controles PASS.`)
