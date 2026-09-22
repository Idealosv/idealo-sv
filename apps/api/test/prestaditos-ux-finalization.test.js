import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPrestaditosSearchResults } from '../../web/src/prestaditos-search.js'
import { buildPrestaditosAgenda, agendaWindow } from '../../web/src/prestaditos-agenda.js'
import { PRESTADITOS_E2E_SCENARIOS, validatePrestaditosDemoScenario } from '../../web/src/prestaditos-demo-scenarios.js'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const profile=read('apps/web/src/PrestaditosInvestor360Panel.jsx')
const agenda=read('apps/web/src/PrestaditosAgendaPanel.jsx')
const searchUi=read('apps/web/src/PrestaditosGlobalSearch.jsx')
const css=read('apps/web/src/prestaditos-investors.css')
const smoke=read('supabase/tests/prestaditos_staging_readiness.sql')
const workflow=read('.github/workflows/prestaditos-staging-smoke.yml')
const runbook=read('docs/prestaditos-staging-runbook.md')
const readiness=read('apps/web/src/PrestaditosProductionReadinessPanel.jsx')
const securityAudit=read('apps/web/scripts/audit-prestaditos-security.mjs')

test('buscador global encuentra DUI contrato pago y documento y abre Perfil 360',()=>{
 const investors=[{id:'i1',first_names:'Carlos Ernesto',last_names:'Mejía',dui:'01234567-8',investor_code:'INV-001'}]
 const investments=[{id:'n1',investor_id:'i1',investment_code:'INVEST-ABC',contract_number:'CN-77',principal:2000,status:'ACTIVE'}]
 const rows=buildPrestaditosSearchResults({
  query:'01234567',
  investors,
  applications:[],
  investments,
  contracts:[{id:'c1',investor_id:'i1',investment_id:'n1',contract_code:'CTR-999',contract_number:'CN-77',status:'SIGNED'}],
  payments:[{id:'p1',investor_id:'i1',investment_id:'n1',payment_code:'PAG-888',reference:'REF-22',amount:100,payment_type:'YIELD'}],
  documents:[{id:'d1',investor_id:'i1',investment_id:'n1',document_code:'DOC-777',title:'Contrato firmado',document_type:'CONTRACT'}],
  beneficiaries:[],
 })
 assert.ok(rows.length>=1)
 assert.equal(rows[0].investor_id,'i1')
 assert.equal(rows[0].tab,'Perfil 360')

 const contract=buildPrestaditosSearchResults({query:'CTR-999',investors,applications:[],investments,contracts:[{id:'c1',investor_id:'i1',investment_id:'n1',contract_code:'CTR-999'}],payments:[],documents:[],beneficiaries:[]})
 assert.equal(contract[0].investment_id,'n1')
 assert.equal(contract[0].tab,'Perfil 360')
})

test('agenda usa fechas reales y no inventa calendario de rendimientos',()=>{
 const investors=[{id:'i1',first_names:'Ana',last_names:'Prueba',status:'ACTIVE',face_photo_path:'x',dui_front_path:'x',dui_back_path:'x'}]
 const investorMap=new Map(investors.map(x=>[x.id,x]))
 const events=buildPrestaditosAgenda({
  investors,
  applications:[{id:'a1',investor_id:'i1',application_code:'SOL-1',status:'REVIEW',requested_start_date:'2026-09-25'}],
  investments:[{id:'n1',investor_id:'i1',investment_code:'INV-1',maturity_date:'2026-09-30',status:'ACTIVE'}],
  contracts:[{id:'c1',investor_id:'i1',investment_id:'n1',contract_code:'CTR-1',status:'GENERATED'}],
  renewals:[],
  investorMap,
 })
 assert.ok(events.some(x=>x.type==='MATURITY'&&x.date==='2026-09-30'))
 assert.ok(events.some(x=>x.type==='REVIEW'&&x.date==='2026-09-25'))
 assert.ok(events.some(x=>x.type==='CONTRACT'&&x.floating===true))
 assert.equal(events.some(x=>x.type==='YIELD'),false)
 assert.ok(Array.isArray(agendaWindow(events,'MONTH')))
})

test('Perfil 360 concentra expediente y accesos rápidos',()=>{
 assert.match(profile,/PERFIL 360/)
 assert.match(profile,/Estado de cuenta/)
 assert.match(profile,/Registrar pago/)
 assert.match(profile,/Renovación/)
 assert.match(profile,/Documentos/)
 assert.match(profile,/Capital vigente/)
 assert.match(profile,/Beneficiarios activos/)
 assert.match(profile,/Últimos pagos/)
 assert.match(profile,/Últimos archivos/)
})

test('host integra Perfil 360 Agenda búsqueda global y navegación móvil',()=>{
 assert.match(host,/PrestaditosInvestor360Panel/)
 assert.match(host,/PrestaditosAgendaPanel/)
 assert.match(host,/PrestaditosGlobalSearch/)
 assert.match(host,/\['Agenda','Vencimientos y tareas'\]/)
 assert.match(host,/\['Perfil 360','Vista integral del inversionista'\]/)
 assert.match(host,/mobileNavOpen/)
 assert.match(host,/prst-mobile-overlay/)
 assert.match(searchUi,/ArrowDown/)
 assert.match(searchUi,/ArrowUp/)
 assert.match(searchUi,/Buscar nombre, DUI, inversión, contrato, pago o documento/)
 assert.match(agenda,/No se agregan cuotas de rendimiento/)
})

test('mobile layout usa drawer y controles táctiles legibles',()=>{
 assert.match(css,/\.prst-sidebar\.mobile-open\{transform:translateX\(0\)\}/)
 assert.match(css,/\.prst-mobile-overlay\{display:block/)
 assert.match(css,/\.prst-global-search-input input\{font-size:13px\}/)
 assert.match(css,/min-height:46px;font-size:13px/)
 assert.match(css,/\.prst-operational-alert/)
})

test('staging smoke está protegido contra el proyecto principal',()=>{
 assert.match(workflow,/workflow_dispatch/)
 assert.match(workflow,/PRESTADITOS_STAGING_DB_URL/)
 assert.match(workflow,/qltxsmuzgbuwevnncezz/)
 assert.match(workflow,/BLOQUEADO/)
 assert.match(smoke,/PRESTADITOS_SMOKE_OK/)
 assert.match(smoke,/RLS disabled/)
 assert.match(smoke,/sensitive tables expose direct authenticated writes/)
 assert.doesNotMatch(smoke,/\binsert into\b/i)
 assert.doesNotMatch(smoke,/\bupdate\s+public\./i)
 assert.doesNotMatch(smoke,/\bdelete from\b/i)
 assert.match(runbook,/no debe utilizarse como base de pruebas/i)
 assert.match(runbook,/Caso A — tasa 10% anual/)
 assert.match(runbook,/Caso B — tasa 12% anual/)
 assert.match(runbook,/Caso C — tasa 15% anual/)
})


test('los tres escenarios ficticios completan el recorrido sin usar una base real',()=>{
 assert.equal(PRESTADITOS_E2E_SCENARIOS.length,3)
 assert.deepEqual(PRESTADITOS_E2E_SCENARIOS.map(x=>x.rate),[10,12,15])
 assert.deepEqual(PRESTADITOS_E2E_SCENARIOS.map(x=>x.amount),[2000,7500,15000])
 assert.deepEqual(PRESTADITOS_E2E_SCENARIOS.map(x=>x.annualReference),[200,900,2250])
 for(const scenario of PRESTADITOS_E2E_SCENARIOS){
  assert.equal(validatePrestaditosDemoScenario(scenario).length,0)
  assert.equal(scenario.termMonths,12)
  assert.ok(scenario.path.some(step=>step[0]==='CONTRACT'))
  assert.ok(scenario.path.some(step=>step[0]==='PAYMENT'))
  assert.ok(scenario.path.some(step=>step[0]==='MATURITY'))
  assert.ok(scenario.path.some(step=>step[0]==='CLOSEOUT'))
 }
})

test('cierre para producción conserva bloqueos reales y no afirma readiness falso',()=>{
 assert.match(readiness,/Producción/)
 assert.match(readiness,/No todavía/)
 assert.match(readiness,/Rangos de monto/)
 assert.match(readiness,/Plazos distintos de 12 meses/)
 assert.match(readiness,/Contrato legal definitivo/)
 assert.match(readiness,/Base aislada de staging/)
 assert.match(readiness,/mientras exista un punto Pendiente o Bloqueado/)
})

test('auditoría estática de seguridad cubre RLS storage tasas pagos y cierres',()=>{
 assert.match(securityAudit,/RLS base inversionistas/)
 assert.match(securityAudit,/bucket privado/)
 assert.match(securityAudit,/pagos sin escritura directa autenticada/)
 assert.match(securityAudit,/tasas anuales forzadas/)
 assert.match(securityAudit,/cierres mensuales no editables directos/)
 assert.match(securityAudit,/PRESTADITOS_SMOKE_OK/)
})
