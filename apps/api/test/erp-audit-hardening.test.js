import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const runtimeSettings = fs.readFileSync(new URL('../src/dte/runtime-settings-service.js', import.meta.url), 'utf8')
const productionTransmit = fs.readFileSync(new URL('../src/dte/transmit-production-service.js', import.meta.url), 'utf8')
const userAdministration = fs.readFileSync(new URL('../src/admin/user-administration-service.js', import.meta.url), 'utf8')
const clientRoleHardening = fs.readFileSync(new URL('../../../supabase/migrations/20260830060000_clients_role_hardening.sql', import.meta.url), 'utf8')

test('configuración DTE solo puede modificarse por owner/admin y producción solo por owner', () => {
  assert.match(runtimeSettings, /requireCompanyAccess/)
  assert.match(runtimeSettings, /allowedRoles:COMPANY_ROLES\.ADMIN/)
  assert.match(runtimeSettings, /role\s*!==\s*'owner'/)
  assert.match(runtimeSettings, /DTE_OWNER_REQUIRED/)
})

test('transmisión DTE de producción exige rol owner', () => {
  assert.match(productionTransmit, /toLowerCase\(\) !== 'owner'/)
  assert.match(productionTransmit, /DTE_OWNER_REQUIRED/)
})

test('listado de usuarios usa la respuesta correcta de Supabase Auth', () => {
  assert.match(userAdministration, /const auth=data\?\.user\|\|null/)
  assert.doesNotMatch(userAdministration, /const auth=user\?\.user\|\|null/)
})

test('viewer queda en solo lectura para Clientes 360', () => {
  assert.match(clientRoleHardening, /lower\(cm\.role\) in \('owner','admin','staff'\)/)
  assert.match(clientRoleHardening, /lower\(cm\.role\) in \('owner','admin'\)/)
  assert.match(clientRoleHardening, /company_member_read/)
  assert.match(clientRoleHardening, /company_team_insert/)
  assert.match(clientRoleHardening, /company_team_update/)
  assert.match(clientRoleHardening, /company_admin_delete/)
})
