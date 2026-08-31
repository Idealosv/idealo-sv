import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const guard = read('../src/AgencyDemoGuard.jsx')
const main = read('../src/main.jsx')
const master = read('../src/SaasMasterPanelHost.jsx')
const api = read('../../api/src/dte/transmit-production-service.js')
const runtime = read('../../api/src/dte/runtime-settings-service.js')
const masterApi = read('../../api/src/admin/saas-master-service.js')
const migration = read('../../../supabase/migrations/20260831150000_agency_demo_mode.sql')

const checks = [
  ['guard demo montado', main.includes('AgencyDemoGuard')],
  ['marca ENTORNO DEMO', guard.includes('ENTORNO DEMO')],
  ['guía comercial', guard.includes('RECORRIDO RECOMENDADO') && guard.includes('Cotizaciones') && guard.includes('Producción')],
  ['consulta demo por empresa', guard.includes(".select('id,name,demo_mode,demo_label,demo_expires_at')")],
  ['columnas demo', migration.includes('demo_mode boolean') && migration.includes('demo_expires_at timestamptz')],
  ['bloqueo DB producción', migration.includes('block_demo_company_production_dte') && migration.includes("new.environment <> 'production'")],
  ['bloqueo API producción', api.includes('DEMO_PRODUCTION_BLOCKED') && api.includes("select('demo_mode,demo_expires_at')")],
  ['configuración fiscal demo queda TEST', runtime.includes('assertCompanyIsNotDemo') && runtime.includes("demoMode ? { ...row, environment: 'test', production_enabled: false, production_approved: false } : row")],
  ['Panel Maestro crea demo', master.includes('Preparar como DEMO para agencia') && master.includes('demo_mode:true')],
  ['seed comercial ficticio', masterApi.includes('[DEMO] Café Central') && masterApi.includes('[DEMO] Banner lona 13 oz')],
  ['seed cotización y producción', masterApi.includes("from('quotes').insert") && masterApi.includes("from('work_orders').insert")],
  ['demo contabilizado', masterApi.includes('demos:rows.filter(x=>x.demo_mode).length')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`FALLA entorno demo: ${failed.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`OK Entorno Demo Agencias: ${checks.length} controles PASS.`)
