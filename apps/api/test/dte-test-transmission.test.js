import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMhPublicError, buildTestReceptionPayload, nextTransmissionAttempt } from '../src/dte/transmit-test-service.js'

test('construye el sobre de recepción exclusivamente para ambiente TEST 00', () => {
  const payload = buildTestReceptionPayload({
    dte_type: '01',
    generation_code: 'f20a6613-5920-45e3-b0e9-bd9b23b2190d',
    signed_document: 'eyJhbGciOiJSUzUxMiJ9.document.signature',
    dte_payload: {
      identificacion: { ambiente: '00', version: 2, tipoDte: '01' },
    },
  })

  assert.deepEqual(payload, {
    ambiente: '00',
    idEnvio: 1,
    version: 2,
    tipoDte: '01',
    documento: 'eyJhbGciOiJSUzUxMiJ9.document.signature',
    codigoGeneracion: 'F20A6613-5920-45E3-B0E9-BD9B23B2190D',
  })
})

test('usa un idEnvio distinto para cada reintento', () => {
  const payload = buildTestReceptionPayload({
    dte_type: '03',
    generation_code: '11111111-2222-4333-8444-555555555555',
    signed_document: 'JWS',
    dte_payload: { identificacion: { ambiente: '00', version: 3, tipoDte: '03' } },
  }, 3)
  assert.equal(payload.idEnvio, 3)
})

test('el sobre no incluye contraseña, token ni credenciales privadas', () => {
  const payload = buildTestReceptionPayload({
    dte_type: '01',
    generation_code: '11111111-2222-4333-8444-555555555555',
    signed_document: 'JWS',
    dte_payload: { identificacion: { version: 2, tipoDte: '01' } },
  })
  const serialized = JSON.stringify(payload).toLowerCase()
  assert.equal(serialized.includes('password'), false)
  assert.equal(serialized.includes('token'), false)
  assert.equal(serialized.includes('secret'), false)
  assert.equal(serialized.includes('production'), false)
})

test('muestra el motivo seguro de rechazo de autenticación MH', () => {
  const error = buildMhPublicError({
    status: 400,
    body: { mensaje: 'Usuario o contraseña inválida' },
  }, 'autenticacion')
  assert.equal(error.statusCode, 400)
  assert.match(error.message, /autenticación/)
  assert.match(error.message, /Usuario o contraseña inválida/)
})

test('conserva cuerpo de rechazo para bitácora sin inventar detalle', () => {
  const body = { estado: 'RECHAZADO', observaciones: ['Campo inválido'] }
  const error = buildMhPublicError({ status: 400, body }, 'recepcion')
  assert.deepEqual(error.mhBody, body)
  assert.match(error.message, /Campo inválido/)
})

test('permite reintentos técnicos hasta el tercer intento', () => {
  assert.equal(nextTransmissionAttempt([]), 1)
  assert.equal(nextTransmissionAttempt([{ attempt_number: 1, finished_at: '2026-08-24T10:00:00Z', error_message: 'timeout' }]), 2)
  assert.equal(nextTransmissionAttempt([
    { attempt_number: 1, finished_at: '2026-08-24T10:00:00Z', error_message: 'timeout' },
    { attempt_number: 2, finished_at: '2026-08-24T10:01:00Z', error_message: 'auth' },
  ]), 3)
})

test('bloquea un reenvío mientras existe un intento en curso', () => {
  assert.throws(
    () => nextTransmissionAttempt([{ attempt_number: 1, finished_at: null }]),
    (error) => error.statusCode === 409 && /todavía está en curso/.test(error.message),
  )
})

test('bloquea más de tres transmisiones del mismo DTE', () => {
  assert.throws(
    () => nextTransmissionAttempt([
      { attempt_number: 1, finished_at: '2026-08-24T10:00:00Z' },
      { attempt_number: 2, finished_at: '2026-08-24T10:01:00Z' },
      { attempt_number: 3, finished_at: '2026-08-24T10:02:00Z' },
    ]),
    (error) => error.statusCode === 409 && /máximo de 3 intentos/.test(error.message),
  )
})
