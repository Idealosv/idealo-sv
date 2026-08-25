import test from 'node:test'
import assert from 'node:assert/strict'
import { getDteConfig, getDteConfigurationStatus } from '../src/dte/config.js'

const valid = {
  DTE_SIGNER_URL: 'http://firmador:8113/',
  DTE_SIGNER_TOKEN: 'transport-secret',
  DTE_MH_NIT: '06140000000000',
  DTE_MH_API_PASSWORD: 'api-secret',
  DTE_SIGNER_PASSWORD: 'certificate-secret',
}

test('usa ambiente de pruebas y límites oficiales por defecto', () => {
  const config = getDteConfig(valid)
  assert.equal(config.environment, 'test')
  assert.equal(config.mhBaseUrl, 'https://apitest.dtes.mh.gob.sv')
  assert.equal(config.signerUrl, 'http://firmador:8113')
  assert.equal(config.signerToken, 'transport-secret')
  assert.equal(config.requestTimeoutMs, 8000)
  assert.equal(config.maxResends, 2)
})

test('impide activar producción por accidente', () => {
  assert.throws(
    () => getDteConfig({ ...valid, DTE_ENVIRONMENT: 'production' }),
    /Producción DTE está bloqueada/,
  )
})

test('el estado público nunca devuelve secretos', () => {
  const status = getDteConfigurationStatus(valid)
  assert.deepEqual(status, {
    environment: 'test',
    configured: true,
    signerConfigured: true,
    productionEnabled: false,
    productionApproved: false,
  })
  assert.equal(JSON.stringify(status).includes('secret'), false)
})
