import test from 'node:test'
import assert from 'node:assert/strict'
import { getDteSignerConfig, getDteConfigurationStatus } from '../src/dte/config.js'
import { extractSignedDocument } from '../src/dte/sign-service.js'

test('extrae documento JWS de respuestas compatibles del firmador', () => {
  assert.equal(extractSignedDocument({ body: { documento: 'jws-1' } }), 'jws-1')
  assert.equal(extractSignedDocument({ document: 'jws-2' }), 'jws-2')
  assert.equal(extractSignedDocument('jws-3'), 'jws-3')
  assert.equal(extractSignedDocument({ body: {} }), null)
})

test('la firma se configura sin exigir credenciales de transmisión MH', () => {
  const env = {
    DTE_SIGNER_URL: 'https://signer.example.com/',
    DTE_SIGNER_TOKEN: 'token-prueba',
    DTE_MH_NIT: '06142812971032',
    DTE_SIGNER_PASSWORD: 'clave-prueba',
  }
  const config = getDteSignerConfig(env)
  assert.equal(config.signerUrl, 'https://signer.example.com')
  assert.equal(config.nit, '06142812971032')
  assert.equal(getDteConfigurationStatus(env).signerConfigured, true)
  assert.equal(getDteConfigurationStatus(env).configured, false)
})
