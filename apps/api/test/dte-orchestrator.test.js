import test from 'node:test'
import assert from 'node:assert/strict'
import { DteOrchestrator } from '../src/dte/orchestrator.js'

function repository(existing = null) {
  const events = []
  return {
    events,
    async findByGenerationCode() { return existing },
    async mark(id, status, values = {}) {
      const row = { id, status, ...values }
      events.push(['mark', row])
      return row
    },
    async recordAttempt(id, number) { events.push(['attempt', id, number]) },
    async recordFailure(id, number, error) { events.push(['failure', id, number, error.message]) },
  }
}

test('es idempotente cuando el DTE ya fue procesado', async () => {
  const current = { id: 'dte-1', status: 'PROCESSED' }
  const repo = repository(current)
  const orchestrator = new DteOrchestrator({
    repository: repo,
    signerClient: { sign: () => assert.fail('no debe firmar otra vez') },
    mhClient: { receive: () => assert.fail('no debe retransmitir') },
  })
  assert.equal(await orchestrator.transmit({ generationCode: 'uuid' }), current)
  assert.deepEqual(repo.events, [])
})

test('firma y transmite un DTE una sola vez cuando Hacienda procesa', async () => {
  const repo = repository()
  const orchestrator = new DteOrchestrator({
    repository: repo,
    signerClient: { async sign() { return { body: { documento: 'signed-jws' } } } },
    mhClient: { async receive() { return { estado: 'PROCESADO', selloRecibido: 'seal' } } },
  })
  const result = await orchestrator.transmit({
    documentId: 'dte-1', generationCode: 'UUID', dte: {}, receptionPayload: { ambiente: '00' },
  })
  assert.equal(result.status, 'PROCESSED')
  assert.equal(repo.events.filter(([type]) => type === 'attempt').length, 1)
})

test('consulta el estado antes de reenviar después de un fallo', async () => {
  const repo = repository()
  let receptions = 0
  let queries = 0
  const orchestrator = new DteOrchestrator({
    repository: repo,
    signerClient: { async sign() { return { documento: 'signed-jws' } } },
    mhClient: {
      async receive() { receptions += 1; throw new Error('timeout') },
      async query() { queries += 1; return { estado: 'PROCESADO', selloRecibido: 'seal' } },
    },
  })
  const result = await orchestrator.transmit({
    documentId: 'dte-1', generationCode: 'UUID', dte: {}, receptionPayload: {},
  })
  assert.equal(result.status, 'PROCESSED')
  assert.equal(receptions, 1)
  assert.equal(queries, 1)
})
