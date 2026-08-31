import fs from 'node:fs'
const files={panel:'../src/SaasMasterPanelHost.jsx',service:'../../api/src/admin/saas-master-service.js',migration:'../../../supabase/migrations/0042_agency_demo_environment.sql'}
const text=Object.fromEntries(Object.entries(files).map(([key,path])=>[key,fs.readFileSync(new URL(path,import.meta.url),'utf8')]))
const checks=[
 ['creación demo desde Panel Maestro',text.panel.includes('demo_mode')&&text.panel.includes('Crear acceso demo')],
 ['métrica agencias demo',text.panel.includes('Agencias demo')],
 ['badge DEMO visible',text.panel.includes('saas-demo-badge')],
 ['demo no registra pago',text.panel.includes("!row.demo?.is_demo")],
 ['backend reconoce demo_mode',text.service.includes("demoMode=request.body?.demo_mode===true")],
 ['demo no suma MRR',text.service.includes("!x.demo?.is_demo")],
 ['perfil demo persistente',text.migration.includes('saas_company_demo_profiles')],
 ['vencimiento demo',text.migration.includes('demo_expires_at')],
 ['bloqueo DTE producción',text.migration.includes('DEMO_DTE_PRODUCTION_BLOCKED')],
 ['trigger fiscal',text.migration.includes('guard_demo_dte_production_trigger')],
 ['RLS demo',text.migration.includes('members_read_company_demo_profile')],
 ['correo externo marcado como bloqueado',text.migration.includes('block_external_email')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('FALLA entorno demo:',failed.map(([name])=>name).join(', '));process.exit(1)}
console.log(`OK entorno demo agencias: ${checks.length} controles PASS.`)
