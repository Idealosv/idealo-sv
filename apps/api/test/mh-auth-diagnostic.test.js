import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnoseMhAuthentication } from '../src/dte/mh-auth-diagnostic-service.js'

const env = {
  DTE_ENVIRONMENT: 'test', DTE_SIGNER_URL: 'http://firmador:8113', DTE_SIGNER_TOKEN: 'signer-token', DTE_MH_NIT: '06140000000000', DTE_SIGNER_PASSWORD: 'signer-password', DTE_MH_API_PASSWORD: 'mh-password', DTE_REQUEST_TIMEOUT_MS: '8000',
}

function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table) {
      if (table === 'company_members') return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { role: 'owner' }, error: null }) }
      if (table === 'dte_runtime_settings') return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { environment: 'test', production_enabled: false, production_approved: false }, error: null }) }
      throw new Error(`Tabla inesperada: ${table}`)
    },
  }
}

test('autentica con Hacienda sin transmitir ningún DTE ni exponer token', async () => {
  const calls = []
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ body: { token: 'Bearer secret-token' } }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  const result = await diagnoseMhAuthentication({ request: { headers: { authorization: 'Bearer session-token' }, query: { companyId: 'company-1' } }, supabase: makeSupabase(), env, fetchImpl })
  assert.equal(result.ok, true); assert.equal(result.authenticated, true); assert.equal(result.tokenReceived, true); assert.equal(result.transmittedDocument, false); assert.equal(result.environment, 'test'); assert.equal(result.endpoint, 'apitest.dtes.mh.gob.sv'); assert.equal(Object.hasOwn(result, 'token'), false); assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://apitest.dtes.mh.gob.sv/seguridad/auth'); assert.equal(String(calls[0].options.body), 'user=06140000000000&pwd=mh-password')
})

test('clasifica rechazo de credenciales sin intentar recepción DTE', async () => {
  const calls = []
  const fetchImpl = async (url) => { calls.push(url); return new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }) }
  const result = await diagnoseMhAuthentication({ request: { headers: { authorization: 'Bearer session-token' }, query: { companyId: 'company-1' } }, supabase: makeSupabase(), env, fetchImpl })
  assert.equal(result.ok, false); assert.equal(result.failureKind, 'AUTH'); assert.equal(result.transmittedDocument, false); assert.equal(calls.length, 1); assert.equal(calls[0].endsWith('/seguridad/auth'), true)
})
