import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const productionService = fs.readFileSync(new URL('../src/dte/transmit-production-service.js', import.meta.url), 'utf8')
const masterService = fs.readFileSync(new URL('../src/admin/saas-master-service.js', import.meta.url), 'utf8')
const seedService = fs.readFileSync(new URL('../src/admin/demo-seed-service.js', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../../../supabase/migrations/20260831150000_agency_demo_mode.sql', import.meta.url), 'utf8')
const seedMigration = fs.readFileSync(new URL('../../../supabase/migrations/20260908152500_secure_demo_seed_rpc.sql', import.meta.url), 'utf8')

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

test('Panel Maestro precarga una demostración publicitaria mediante RPC protegido', () => {
  assert.match(masterService, /import \{ seedAgencyDemo \} from '\.\/demo-seed-service\.js'/)
  assert.match(masterService, /createdBy\s*:\s*owner\.id/)
  assert.match(seedService, /rpc\('seed_agency_demo_data'/)
  assert.match(seedMigration, /\[DEMO\] Café Central/)
  assert.match(seedMigration, /\[DEMO\] Clínica Sonrisa/)
  assert.match(seedMigration, /\[DEMO\] Banner lona 13 oz/)
  assert.match(seedMigration, /insert into public\.quotes/)
  assert.match(seedMigration, /insert into public\.work_orders/)
  assert.match(seedMigration, /revoke all on function public\.seed_agency_demo_data\(uuid,uuid\) from authenticated/)
  assert.match(seedMigration, /grant execute on function public\.seed_agency_demo_data\(uuid,uuid\) to service_role/)
})
