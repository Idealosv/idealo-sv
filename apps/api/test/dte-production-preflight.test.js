import test from 'node:test'
import assert from 'node:assert/strict'
import { getDteConfig, getDteProductionPreflightStatus } from '../src/dte/config.js'

const base = {
  DTE_SIGNER_URL: 'https://signer.example.test',
  DTE_SIGNER_TOKEN: 'x'.repeat(32),
  DTE_MH_NIT: '012345678',
  DTE_SIGNER_PASSWORD: 'private-password',
  DTE_MH_API_PASSWORD: 'mh-password',
}

test('producción permanece bloqueada sin aprobación explícita aunque ENABLE sea true', () => {
  assert.throws(() => getDteConfig({
    ...base,
    DTE_ENVIRONMENT: 'production',
    DTE_ENABLE_PRODUCTION: 'true',
  }), /aprobación explícita/i)
})

test('preflight informa bloqueos sin exponer secretos', () => {
  const status = getDteProductionPreflightStatus({
    ...base,
    DTE_ENVIRONMENT: 'test',
    DTE_ENABLE_PRODUCTION: 'false',
  })

  assert.equal(status.configurationReady, false)
  assert.equal(status.environment, 'test')
  assert.equal(status.productionEnabled, false)
  assert.equal(status.explicitApproval, false)
  assert.equal(status.credentialsConfigured, true)
  assert.equal(status.transmissionEndpointAvailable, false)
  assert.ok(status.blockers.length >= 3)
  const serialized = JSON.stringify(status)
  assert.equal(serialized.includes(base.DTE_SIGNER_PASSWORD), false)
  assert.equal(serialized.includes(base.DTE_MH_API_PASSWORD), false)
  assert.equal(serialized.includes(base.DTE_SIGNER_TOKEN), false)
})

test('preflight de configuración queda listo solo con production, enable, aprobación y URL oficial', () => {
  const env = {
    ...base,
    DTE_ENVIRONMENT: 'production',
    DTE_ENABLE_PRODUCTION: 'true',
    DTE_PRODUCTION_APPROVAL: 'IDEALO_SV_PRODUCTION_APPROVED',
  }
  const status = getDteProductionPreflightStatus(env)
  assert.equal(status.configurationReady, true)
  assert.equal(status.transmissionEndpointAvailable, false)
  assert.deepEqual(status.blockers, [])
  const config = getDteConfig(env)
  assert.equal(config.environment, 'production')
  assert.equal(config.mhBaseUrl, 'https://api.dtes.mh.gob.sv')
})

test('producción rechaza una URL MH distinta de la oficial', () => {
  assert.throws(() => getDteConfig({
    ...base,
    DTE_ENVIRONMENT: 'production',
    DTE_ENABLE_PRODUCTION: 'true',
    DTE_PRODUCTION_APPROVAL: 'IDEALO_SV_PRODUCTION_APPROVED',
    DTE_MH_BASE_URL: 'https://example.invalid',
  }), /endpoint oficial/i)
})
