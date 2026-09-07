import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const main = read('apps/web/src/main.jsx')
const deferred = read('apps/web/src/DeferredRuntimeHosts.jsx')

const deferredModules = [
  'ExecutiveDashboardHost', 'CommercialLauncher', 'OperationsFinanceLauncher',
  'InventoryCostLauncher', 'FinancialDashboardLauncher', 'HrPayrollLauncher',
  'ProductionCalendarLauncher', 'QualityControlLauncher', 'FacturacionLauncher',
  'AssistantLauncher', 'SecurityLauncher', 'MobileAppHost', 'MobileDteHost',
  'SaasMasterPanelHost', 'SaasBillingCenterHost', 'SaasCommercialControlHost',
  'SaasCustomerAccountHost', 'ModuleRuntime'
]

test('el arranque crítico no importa estáticamente los runtimes secundarios', () => {
  assert.match(main, /lazy\(\(\)=>import\('\.\/DeferredRuntimeHosts\.jsx'\)\)/)
  assert.match(main, /requestIdleCallback/)
  assert.match(main, /timeout:350/)
  for (const moduleName of deferredModules) {
    assert.doesNotMatch(main, new RegExp(`import\\s+${moduleName}\\s+from`), `${moduleName} no debe bloquear el primer render`)
    assert.match(deferred, new RegExp(`import\\s+${moduleName}\\s+from`), `${moduleName} debe conservarse en el runtime diferido`)
  }
})

test('seguridad esencial permanece en el arranque crítico', () => {
  assert.match(main, /import AccessControlRuntime/)
  assert.match(main, /import MfaSessionGate/)
  assert.match(main, /<App\/>/)
  assert.match(main, /<MfaSessionGate\/>/)
  assert.match(main, /<AccessControlRuntime\/>/)
})

test('el runtime diferido conserva aislamiento de fallos por módulo', () => {
  assert.match(deferred, /RuntimeBoundary/)
  assert.match(deferred, /<Safe label="Facturación">/)
  assert.match(deferred, /<Safe label="Panel Maestro SaaS">/)
  assert.match(deferred, /<Safe label="Runtime móvil">/)
})
