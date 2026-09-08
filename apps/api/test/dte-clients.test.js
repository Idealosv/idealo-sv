import test from 'node:test'
import assert from 'node:assert/strict'
import { MhDteClient } from '../src/dte/mh-client.js'
import { DteSignerClient } from '../src/dte/signer-client.js'

const config = {
  mhBaseUrl: 'https://apitest.dtes.mh.gob.sv',
  signerUrl: 'http://firmador:8113',
  signerToken: 'transport-secret',
  nit: '06140000000000',
  apiPassword: 'mh-secret',
  signerPassword: 'signer-secret',
  requestTimeoutMs: 8000,
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('autentica y transmite usando el token de Hacienda', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/seguridad/auth')) return jsonResponse({ body: { token: 'Bearer test-token' } })
    return jsonResponse({ estado: 'PROCESADO', selloRecibido: 'seal' })
  }
  const client = new MhDteClient(config, { fetchImpl })
  const result = await client.receive({ documento: 'jws' })

  assert.equal(result.estado, 'PROCESADO')
  assert.equal(calls[0].options.body.toString(), 'user=06140000000000&pwd=mh-secret')
  assert.equal(calls[1].options.headers.authorization, 'Bearer test-token')
  assert.equal(calls[1].url, 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte')
})

test('envía la contraseña del certificado únicamente al firmador privado', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, body: JSON.parse(options.body), headers: options.headers }
    return jsonResponse({ body: { documento: 'signed-jws' } })
  }
  const client = new DteSignerClient(config, { fetchImpl })
  await client.sign({ identificacion: { tipoDte: '01' } })

  assert.equal(request.url, 'http://firmador:8113/firmardocumento/')
  assert.equal(request.body.passwordPri, 'signer-secret')
  assert.equal(request.headers['x-signer-token'], 'transport-secret')
  assert.equal(request.body.dteJson.identificacion.tipoDte, '01')
})

test('warmup despierta el servicio por actuator health sin enviar secretos', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, headers: options.headers }
    return jsonResponse({ status: 'UP' })
  }
  const client = new DteSignerClient(config, { fetchImpl })
  const result = await client.warmup({ timeoutMs: 45000 })

  assert.equal(result.status, 'UP')
  assert.equal(request.url, 'http://firmador:8113/actuator/health')
  assert.equal(request.headers['x-signer-token'], undefined)
  assert.equal(JSON.stringify(request).includes('signer-secret'), false)
})
