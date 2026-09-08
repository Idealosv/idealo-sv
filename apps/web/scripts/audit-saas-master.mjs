import fs from 'node:fs'
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const host=read('src/SaasMasterPanelHost.jsx')
const main=read('src/main.jsx')
const service=fs.readFileSync(new URL('../../api/src/admin/saas-master-service.js',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/0040_saas_commercial_core.sql',import.meta.url),'utf8')
const checks=[
 ['ruta /master',host.includes("window.location.pathname==='/master'")],
 ['host montado',main.includes('<SaasMasterPanelHost/>')],
 ['sesión bearer',host.includes('Authorization:`Bearer ${session.access_token}`')],
 ['dashboard SaaS',host.includes('/api/admin/saas/dashboard')],
 ['crear empresa',host.includes('/api/admin/saas/companies')],
 ['registrar pago',host.includes('/payments')],
 ['renovar suscripción',host.includes("renew:true")],
 ['protección servidor',service.includes('IDEALO_PLATFORM_ADMIN_EMAILS')&&service.includes('PLATFORM_ADMIN_REQUIRED')],
 ['validación JWT servidor',service.includes('supabase.auth.getUser(token)')],
 ['catálogo planes',migration.includes('create table if not exists public.saas_plans')],
 ['suscripciones empresa',migration.includes('public.saas_company_subscriptions')],
 ['eventos billing',migration.includes('public.saas_billing_events')],
 ['RLS SaaS',migration.includes('enable row level security')],
]
const failed=checks.filter(([,ok])=>!ok)
for(const[name,ok]of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`)
if(failed.length){console.error(`FALLÓ auditoría SaaS: ${failed.map(x=>x[0]).join(', ')}`);process.exit(1)}
console.log(`OK Panel Maestro SaaS: ${checks.length} contratos PASS.`)
