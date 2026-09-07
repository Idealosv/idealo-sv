import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260907202000_rpc_execution_surface_hardening.sql')
const production = read('apps/api/src/dte/transmit-production-service.js')
const access = read('apps/api/src/dte/access-control.js')
const mobileGuard = read('apps/web/src/MobileDteEnvironmentGuard.jsx')
const saasGuard = read('apps/web/src/MobileSaasPlanGuard.jsx')

test('helpers internos de autorización no quedan ejecutables por authenticated', () => {
  assert.match(migration, /erp_company_role\(uuid\).*public, anon, authenticated/i)
  assert.match(migration, /is_company_member\(uuid\).*public, anon, authenticated/i)
})

test('numeración DTE queda reservada al backend privilegiado', () => {
  assert.match(migration, /next_dte_control_number\(uuid, text, text, text, text\).*public, anon, authenticated/i)
  assert.match(migration, /grant execute on function public\.next_dte_control_number[\s\S]*service_role, postgres/i)
})

test('preproducción conserva autorización explícita y no activa producción automáticamente', () => {
  assert.match(access, /production_approved/i)
  assert.match(production, /PRODUCTION/i)
  assert.doesNotMatch(migration, /update\s+public\.dte_runtime_settings[\s\S]*production_approved\s*=\s*true/i)
})

test('móvil mantiene doble guardia de plan SaaS y ambiente DTE', () => {
  assert.match(saasGuard, /mobile_apps_enabled/i)
  assert.match(mobileGuard, /PRODUCCION|PRODUCCIÓN|production/i)
})
