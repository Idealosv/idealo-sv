import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const productionService = fs.readFileSync(new URL('../src/dte/transmit-production-service.js', import.meta.url), 'utf8')
const masterService = fs.readFileSync(new URL('../src/admin/saas-master-service.js', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../../../supabase/migrations/20260831150000_agency_demo_mode.sql', import.meta.url), 'utf8')

test('empresa demo queda bloqueada antes de transmitir DTE de producción', () => {
  assert.match(productionService, /DEMO_PRODUCTION_BLOCKED/)
  assert.match(productionService, /company\?\.demo_mode/)
  assert.match(productionService, /Utilizá ambiente TEST/)
})

test('base de datos también impide DTE producción para demo', () => {
  assert.match(migration, /block_demo_company_production_dte/)
  assert.match(migration, /new\.environment <> 'production'/)
  assert.match(migration, /ENTORNO DEMO: los DTE de PRODUCCIÓN están bloqueados/)
})

test('Panel Maestro precarga una demostración publicitaria sin datos reales', () => {
  assert.match(masterService, /\[DEMO\] Café Central/)
  assert.match(masterService, /\[DEMO\] Clínica Sonrisa/)
  assert.match(masterService, /\[DEMO\] Banner lona 13 oz/)
  assert.match(masterService, /from\('quotes'\)\.insert/)
  assert.match(masterService, /from\('work_orders'\)\.insert/)
})
