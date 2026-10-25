import test from 'node:test'
import assert from 'node:assert/strict'
import { isTransientSignerWakeError, waitForSignerReady } from '../src/dte/signer-readiness.js'

test('firma DTE: health 502 mientras el firmador despierta es recuperable', async () => {
  let clock = 0
  let calls = 0
  const signer = {
    async warmup({ timeoutMs }) {
      assert.ok(timeoutMs <= 15000)
      calls++
      if (calls <= 3) throw Object.assign(new Error('bad gateway'), { status: 502 })
      return { status: 'UP' }
    },
  }
  const health = await waitForSignerReady({
    signer,
    maxWaitMs: 120000,
    now: () => clock,
    sleep: async (ms) => { clock += ms },
  })
  assert.deepEqual(health, { status: 'UP' })
  assert.equal(calls, 4)
  assert.equal(clock, 7500)
})

test('firma DTE: errores del certificado o credenciales no se reintentan', async () => {
  const unauthorized = Object.assign(new Error('invalid credentials'), { status: 401 })
  let calls = 0
  await assert.rejects(
    () => waitForSignerReady({
      signer: { warmup: async () => { calls++; throw unauthorized } },
      now: () => 0,
    }),
    (error) => error === unauthorized,
  )
  assert.equal(calls, 1)
  assert.equal(isTransientSignerWakeError(unauthorized), false)
  assert.equal(isTransientSignerWakeError({ status: 503 }), true)
})

test('firma DTE: el arranque demasiado largo falla sin reclamar el borrador', async () => {
  let clock = 0
  let calls = 0
  await assert.rejects(
    () => waitForSignerReady({
      signer: { warmup: async () => { calls++; throw Object.assign(new Error('unavailable'), { status: 503 }) } },
      maxWaitMs: 6000,
      retryDelayMs: 2500,
      now: () => clock,
      sleep: async (ms) => { clock += ms },
    }),
    (error) => error.statusCode === 503 && /permanece en borrador/.test(error.message),
  )
  assert.equal(clock, 6000)
  assert.equal(calls, 3)
})
