import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const masterService = fs.readFileSync(new URL('../src/admin/saas-master-service.js', import.meta.url), 'utf8')
const billingService = fs.readFileSync(new URL('../src/admin/saas-billing-center-service.js', import.meta.url), 'utf8')
const masterPanel = fs.readFileSync(new URL('../../web/src/SaasMasterPanelHost.jsx', import.meta.url), 'utf8')
const masterCss = fs.readFileSync(new URL('../../web/src/saas-master-panel.css', import.meta.url), 'utf8')
const deferredHosts = fs.readFileSync(new URL('../../web/src/DeferredRuntimeHosts.jsx', import.meta.url), 'utf8')
const billingHost = fs.readFileSync(new URL('../../web/src/SaasBillingCenterHost.jsx', import.meta.url), 'utf8')
const commercialHost = fs.readFileSync(new URL('../../web/src/SaasCommercialControlHost.jsx', import.meta.url), 'utf8')

test('métricas del Panel Maestro excluyen DEMO e internas de cartera y MRR', () => {
  assert.match(masterService, /account_type:type/)
  assert.match(masterService, /const commercial=rows\.filter\(row=>row\.account_type==='commercial'\)/)
  assert.match(masterService, /companies:commercial\.length/)
  assert.match(masterService, /activation_pending:commercial\.filter/)
  assert.match(masterService, /mrr:commercial\.filter/)
  assert.match(masterService, /commercial_plans:commercialPlans/)
})

test('cuentas DEMO e internas no admiten cobros comerciales', () => {
  assert.match(masterService, /BILLING_EXEMPT_ACCOUNT/)
  assert.match(masterService, /INTERNAL_PLAN_PROTECTED/)
  assert.match(masterService, /COMMERCIAL_PLAN_REQUIRED/)
  assert.match(billingService, /billing_exempt:billingExempt/)
  assert.match(billingService, /commercialPayments/)
})

test('Panel Maestro integra acciones sin inyección DOM ni botones flotantes', () => {
  assert.doesNotMatch(deferredHosts, /MasterCompanyToolsRuntime/)
  assert.doesNotMatch(billingHost, /saas-billing-fab/)
  assert.doesNotMatch(commercialHost, /saas-commercial-fab/)
  assert.match(masterPanel, /onEnter=\{enterCompany\}/)
  assert.match(masterPanel, /onSendAccess=\{sendAccess\}/)
  assert.match(masterPanel, /href="\/master\/cobros"/)
  assert.match(masterPanel, /href="\/master\/finanzas"/)
})

test('cobro mensual no ejecuta una segunda renovación desde el frontend', () => {
  const start = masterPanel.indexOf('const recordPayment = async event =>')
  const end = masterPanel.indexOf('const m = data?.metrics || {}')
  const section = masterPanel.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(section, /\/subscription`/)
  assert.doesNotMatch(section, /renew:\s*true/)
})

test('estética del Panel Maestro mantiene contraste y grilla ordenada', () => {
  assert.match(masterCss, /\.saas-master-header h1\{[^}]*color:#fff!important/)
  assert.match(masterCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/)
  assert.match(masterCss, /\.saas-company-type\.type-demo/)
  assert.match(masterPanel, /Clientes comerciales/)
  assert.match(masterPanel, /No comerciales/)
})