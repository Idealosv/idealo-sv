import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const api = read('apps/api/src/index.js')
const draft = read('apps/api/src/dte/draft-service.js')
const invoice = read('apps/api/src/dte/invoice-service.js')
const sign = read('apps/api/src/dte/sign-service.js')
const transmitTest = read('apps/api/src/dte/transmit-test-service.js')
const transmitProduction = read('apps/api/src/dte/transmit-production-service.js')
const subscriptionAdmin = read('apps/api/src/admin/saas-subscription-admin-service.js')
const notifications = read('apps/api/src/admin/saas-notification-service.js')

test('estado y preflight DTE ya no son endpoints públicos de configuración', () => {
  assert.match(api, /requireDteAdminRoute/)
  assert.match(api, /\/api\/dte\/status[\s\S]*requireDteAdminRoute/)
  assert.match(api, /\/api\/dte\/production-preflight[\s\S]*requireDteAdminRoute/)
  assert.match(api, /dte:\{configuration:'protected'\}/)
})

test('diagnósticos y autopruebas DTE exigen admin y entitlement DTE', () => {
  assert.match(api, /allowedRoles:COMPANY_ROLES\.ADMIN/)
  assert.match(api, /moduleCode:'DTE'/)
  for (const route of ['runtime-settings','mh-auth-diagnostic','signer-diagnostic','gmail-test','invoice-email-self-test']) {
    const routeIndex = api.indexOf(`/api/dte/${route}`)
    assert.ok(routeIndex >= 0, `falta ruta ${route}`)
    assert.ok(api.slice(routeIndex, routeIndex + 420).includes('requireDteAdminRoute'), `${route} debe usar guardia administrativa DTE`)
  }
})

test('borrador DTE legado también exige rol owner/admin y plan DTE', () => {
  assert.match(draft, /requireAuthenticatedUser/)
  assert.match(draft, /requireCompanyRole/)
  assert.match(draft, /allowedRoles:\s*DTE_ROLES\.DRAFT/)
  assert.match(draft, /environment','test'/)
})

test('flujo DTE principal conserva aislamiento, rol, preflight y protección anti duplicado', () => {
  assert.match(invoice, /requireCompanyRole/)
  assert.match(invoice, /getDteProductionPreflightStatus/)
  assert.match(invoice, /next_dte_control_number/)
  assert.match(sign, /requireCompanyRole/)
  assert.match(sign, /productionSigningConfirmation/)
  assert.match(transmitTest, /nextTransmissionAttempt/)
  assert.match(transmitTest, /allowedRoles:\s*DTE_ROLES\.TRANSMIT_TEST/)
  assert.match(transmitProduction, /Solo el propietario/)
  assert.match(transmitProduction, /TRANSMITTING/)
  assert.match(transmitProduction, /productionConfirmation/)
})

test('empresa Legacy solo recibe plan mediante confirmación administrativa explícita', () => {
  assert.match(api, /assign-legacy-plan/)
  assert.match(subscriptionAdmin, /ASIGNAR PLAN A EMPRESA LEGACY/)
  assert.match(subscriptionAdmin, /COMPANY_ALREADY_SUBSCRIBED/)
  assert.match(subscriptionAdmin, /LEGACY_PLAN_ASSIGNED/)
  assert.match(subscriptionAdmin, /activation_payment_recorded:false/)
  assert.doesNotMatch(subscriptionAdmin, /assignLegacySubscription[\s\S]*activation_paid_at\s*:/)
})

test('Asistente IA no permite a staff saltarse permisos financieros', () => {
  assert.match(api, /requireAiCompanyRoute/)
  assert.match(api, /allowedRoles:\['owner','admin','viewer'\]/)
  assert.match(api, /auditAction:'AI_ACCESS_DENIED'/)
  for (const route of ['/api/ai/snapshot','/api/ai/ask']) {
    const routeIndex = api.indexOf(route)
    assert.ok(routeIndex >= 0)
    assert.ok(api.slice(routeIndex, routeIndex + 360).includes('requireAiCompanyRoute'))
  }
})

test('recordatorios SaaS tienen dry-run, deduplicación y protección DEMO', () => {
  assert.match(api, /\/api\/admin\/saas\/reminders\/dispatch/)
  assert.match(notifications, /dry_run!==false/)
  assert.match(notifications, /eq\('status','pending'\)/)
  assert.match(notifications, /is\('sent_at',null\)/)
  assert.match(notifications, /company\.demo_mode/)
  assert.match(notifications, /status:'sent',sent_at:now/)
  assert.match(notifications, /PLATFORM_ADMIN_REQUIRED/)
  assert.match(notifications, /DUE_7/)
  assert.match(notifications, /SUSPENDED/)
})

test('ningún cambio V2 activa DTE PRODUCCIÓN por defecto', () => {
  assert.doesNotMatch(api, /DTE_PRODUCTION_APPROVAL\s*=\s*['"]IDEALO_SV_PRODUCTION_APPROVED/)
  assert.match(api, /configuration:'protected'/)
})
