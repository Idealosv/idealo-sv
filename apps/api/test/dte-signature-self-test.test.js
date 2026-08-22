import test from 'node:test'
import assert from 'node:assert/strict'
import { runSignatureSelfTest } from '../src/dte/signature-self-test.js'

const configuredTestEnv = {
  DTE_ENVIRONMENT: 'test',
  DTE_ENABLE_PRODUCTION: 'false',
  DTE_SIGNER_URL: 'http://firmador:8113',
  DTE_SIGNER_TOKEN: 'transport-secret',
  DTE_MH_NIT: '06140000000000',
  DTE_MH_API_PASSWORD: 'mh-secret',
  DTE_SIGNER_PASSWORD: 'certificate-secret',
}

test('firma un objeto inocuo y nunca lo transmite a Hacienda', async () => {
  let payload
  const result = await runSignatureSelfTest({
    env: configuredTestEnv,
    createSigner: () => ({
      sign: async (value) => {
        payload = value
        return { body: { documento: 'signed-jws-discarded' } }
      },
    }),
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.signed, true)
  assert.equal(result.transmitted, false)
  assert.equal(payload.prueba.transmitible, false)
})

test('acepta el formato oficial del firmador con JWS directamente en body', async () => {
  const result = await runSignatureSelfTest({
    env: configuredTestEnv,
    createSigner: () => ({
      sign: async () => ({ status: 'OK', body: 'official-signed-jws' }),
    }),
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.signed, true)
  assert.equal(result.transmitted, false)
})

test('se bloquea fuera del ambiente de pruebas', async () => {
  let called = false
  const result = await runSignatureSelfTest({
    env: { ...configuredTestEnv, DTE_ENVIRONMENT: 'production', DTE_ENABLE_PRODUCTION: 'true' },
    createSigner: () => {
      called = true
      return { sign: async () => ({}) }
    },
  })

  assert.equal(result.status, 'skipped')
  assert.equal(result.reason, 'ONLY_AVAILABLE_IN_TEST')
  assert.equal(called, false)
})

test('informa únicamente el código seguro cuando el firmador rechaza', async () => {
  const result = await runSignatureSelfTest({
    env: configuredTestEnv,
    createSigner: () => ({
      sign: async () => ({ status: 'ERROR', body: { codigo: '803', mensaje: 'detalle privado' } }),
    }),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.signerCode, '803')
  assert.equal(JSON.stringify(result).includes('detalle privado'), false)
})
