import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const read=(file)=>readFile(resolve(src,file),'utf8')
const [main,deferred,runtime,host,alerts]=await Promise.all([
  read('main.jsx'),
  read('DeferredRuntimeHosts.jsx'),
  read('ModuleRuntime.jsx'),
  read('ExecutiveDashboardHost.jsx'),
  read('FinancialAlertsDashboard.jsx'),
])

const failures=[]
const requireText=(source,text,message)=>{if(!source.includes(text))failures.push(message)}

requireText(main,"import './financial-alerts-dashboard.css'",'main.jsx debe cargar estilos de alertas financieras')
requireText(main,"lazy(()=>import('./DeferredRuntimeHosts.jsx'))",'main.jsx debe diferir los hosts secundarios')
requireText(deferred,"import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'",'DeferredRuntimeHosts debe importar ExecutiveDashboardHost')
requireText(deferred,'<Safe label="Dashboard ejecutivo"><ExecutiveDashboardHost/></Safe>','DeferredRuntimeHosts debe montar una sola vez el Dashboard ejecutivo')
if(runtime.includes("import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'")||runtime.includes('<ExecutiveDashboardHost'))failures.push('ModuleRuntime no debe duplicar el Dashboard ejecutivo')
requireText(host,"import FinancialAlertsDashboard from './FinancialAlertsDashboard.jsx'",'ExecutiveDashboardHost debe integrar alertas financieras')
requireText(host,"window.addEventListener('idealo-module-change',onModule)",'ExecutiveDashboardHost debe escuchar el cambio de módulo')
requireText(host,"event.detail==='Dashboard'",'ExecutiveDashboardHost debe mostrarse únicamente en Dashboard')
requireText(host,'if(!content||!visible)return null','ExecutiveDashboardHost debe ocultarse fuera del módulo Dashboard')
requireText(host,'<FinancialAlertsDashboard company={company} supabase={supabase}/>','ExecutiveDashboardHost debe renderizar las alertas')
if(host.includes('new MutationObserver')||host.includes('observe(document.body'))failures.push('ExecutiveDashboardHost no debe reintroducir MutationObserver global')

const mounts=(deferred.match(/<ExecutiveDashboardHost\s*\/?>/g)||[]).length
if(mounts!==1)failures.push(`ExecutiveDashboardHost debe montarse exactamente una vez en DeferredRuntimeHosts; encontrados ${mounts}`)
if(main.includes("import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'")||main.includes('<ExecutiveDashboardHost'))failures.push('ExecutiveDashboardHost no debe volver a bloquear el arranque crítico')

for(const table of ['cash_accounts','cash_movements','accounts_receivable','accounts_payable','cash_reconciliations','work_orders','inventory_movements','work_order_costs']){
  requireText(alerts,`.from('${table}')`,`Alertas debe consultar ${table}`)
}
for(const marker of ['Caja insuficiente para próximos pagos','Cuentas por cobrar vencidas','CxP próximas a vencer','Diferencias de conciliación','Caída de margen','con pérdida','Flujo de efectivo negativo a 7 días']){
  requireText(alerts,marker,`Falta alerta automática: ${marker}`)
}
requireText(alerts,".eq('company_id', company.id)",'Las consultas deben aislar por company_id')

if(failures.length){
  console.error('\nAuditoría de Dashboard ejecutivo falló:')
  failures.forEach((failure)=>console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría Dashboard ejecutivo OK: host único diferido, visibilidad por módulo, aislamiento por empresa y alertas financieras críticas cubiertas.')
