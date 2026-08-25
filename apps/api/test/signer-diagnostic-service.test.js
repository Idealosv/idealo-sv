import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySignerFailure } from '../src/dte/signer-diagnostic-service.js'

test('clasifica timeout del firmador sin confundirlo con certificado', () => {
  const result = classifySignerFailure(new Error('La solicitud DTE superó 20000 ms.'))
  assert.equal(result.kind, 'TIMEOUT')
  assert.match(result.message, /tiempo de espera/i)
})

test('clasifica rechazo de credencial interna del firmador', () => {
  const error = new Error('El servicio DTE respondió HTTP 403.')
  error.status = 403
  const result = classifySignerFailure(error)
  assert.equal(result.kind, 'AUTH')
  assert.match(result.message, /credencial interna/i)
})

test('clasifica fallo de red del firmador', () => {
  const result = classifySignerFailure(new Error('No fue posible conectar con el servicio DTE.'))
  assert.equal(result.kind, 'NETWORK')
  assert.match(result.message, /conexión/i)
})

test('clasifica errores HTTP del firmador sin exponer cuerpo sensible', () => {
  const error = new Error('El servicio DTE respondió HTTP 500.')
  error.status = 500
  error.body = { token: 'secreto', password: 'secreto' }
  const result = classifySignerFailure(error)
  assert.equal(result.kind, 'HTTP')
  assert.equal(result.message, 'El firmador respondió HTTP 500.')
  assert.doesNotMatch(result.message, /secreto/)
})
