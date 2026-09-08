import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const guard = read('../src/AgencyDemoGuard.jsx')
const main = read('../src/main.jsx')
const deferred = read('../src/DeferredRuntimeHosts.jsx')
const master = read('../src/SaasMasterPanelHost.jsx')
const security = read('../src/SecurityLauncher.jsx')
const api = read('../../api/src/dte/transmit-production-service.js')
const runtime = read('../../api/src/dte/runtime-settings-service.js')
const masterApi = read('../../api/src/admin/saas-master-service.js')
const userAdmin = read('../../api/src/admin/user-administration-service.js')
const genericSeed = read('../../api/src/admin/demo-seed-service.js')
const migration = read('../../../supabase/migrations/20260831150000_agency_demo_mode.sql')
const seedRpcMigration = read('../../../supabase/migrations/20260908152500_secure_demo_seed_rpc.sql')

const demoRuntimeProtected =
  runtime.includes('assertCompanyIsNotDemo') &&
  runtime.includes("environment:'test'") &&
  runtime.includes('production_enabled:false') &&
  runtime.includes('production_approved:false') &&
  runtime.includes("supabase.from('companies').select('demo_mode')") &&
  runtime.includes('effectiveRow')

const masterCreatesDemo =
  master.includes('demo_mode: false') &&
  master.includes('form.demo_mode') &&
  master.includes('Crear como DEMO comercial') &&
  master.includes("request('/api/admin/saas/companies'") &&
  masterApi.includes('demo_mode:demoMode') &&
  masterApi.includes('if(demoMode)await seedAgencyDemo')

const sharedCredentialsProtected =
  security.includes("company?.demo_mode===true") &&
  security.includes('Seguridad protegida en demostración') &&
  security.includes('contraseña y 2FA están bloqueados') &&
  userAdmin.includes('assertNotDemoAdminMutation')

const genericSeedProtected =
  genericSeed.includes("rpc('seed_agency_demo_data'") &&
  seedRpcMigration.includes('security definer') &&
  seedRpcMigration.includes('DEMO_COMPANY_REQUIRED') &&
  seedRpcMigration.includes('DEMO_MEMBER_REQUIRED') &&
  seedRpcMigration.includes('revoke all on function public.seed_agency_demo_data(uuid,uuid) from authenticated') &&
  seedRpcMigration.includes('grant execute on function public.seed_agency_demo_data(uuid,uuid) to service_role')

const checks = [
  ['runtime diferido conectado', main.includes("lazy(()=>import('./DeferredRuntimeHosts.jsx'))")],
  ['guard demo montado', deferred.includes("import AgencyDemoGuard from './AgencyDemoGuard.jsx'") && deferred.includes('<AgencyDemoGuard/>')],
  ['marca ENTORNO DEMO', guard.includes('ENTORNO DEMO')],
  ['guía comercial', guard.includes('RECORRIDO RECOMENDADO') && guard.includes('Cotizaciones') && guard.includes('Producción')],
  ['consulta demo por empresa', guard.includes(".select('id,name,demo_mode,demo_label,demo_expires_at')")],
  ['columnas demo', migration.includes('demo_mode boolean') && migration.includes('demo_expires_at timestamptz')],
  ['bloqueo DB producción', migration.includes('block_demo_company_production_dte') && migration.includes("new.environment <> 'production'")],
  ['bloqueo API producción', api.includes('DEMO_PRODUCTION_BLOCKED') && api.includes("select('demo_mode,demo_expires_at')")],
  ['configuración fiscal demo queda TEST', demoRuntimeProtected],
  ['credenciales demo compartidas protegidas', sharedCredentialsProtected],
  ['precarga genérica usa RPC privilegiado', genericSeedProtected],
  ['Panel Maestro crea demo', masterCreatesDemo],
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
