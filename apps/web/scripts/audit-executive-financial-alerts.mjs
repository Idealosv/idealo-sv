import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const read=(file)=>readFile(resolve(src,file),'utf8')
const [main,runtime,host,alerts]=await Promise.all([
  read('main.jsx'),
  read('ModuleRuntime.jsx'),
  read('ExecutiveDashboardHost.jsx'),
  read('FinancialAlertsDashboard.jsx'),
])

const failures=[]
const requireText=(source,text,message)=>{if(!source.includes(text))failures.push(message)}

requireText(main,"import './financial-alerts-dashboard.css'",'main.jsx debe cargar estilos de alertas financieras')
requireText(runtime,"import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'",'ModuleRuntime debe importar ExecutiveDashboardHost')
requireText(runtime,"activeModule === 'Dashboard'",'ModuleRuntime debe cargar el Dashboard únicamente en su módulo')
requireText(runtime,'<Safe label="Dashboard ejecutivo"><ExecutiveDashboardHost /></Safe>','ModuleRuntime debe montar el Dashboard ejecutivo de forma condicional')
requireText(host,"import FinancialAlertsDashboard from './FinancialAlertsDashboard.jsx'",'ExecutiveDashboardHost debe integrar alertas financieras')
requireText(host,'<FinancialAlertsDashboard company={company} supabase={supabase}/>','ExecutiveDashboardHost debe renderizar las alertas')
if(host.includes('new MutationObserver')||host.includes('observe(document.body'))failures.push('ExecutiveDashboardHost no debe reintroducir MutationObserver global')

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
console.log('Auditoría Dashboard ejecutivo OK: runtime condicional, aislamiento por empresa y alertas financieras críticas cubiertas.')
