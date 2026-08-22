import test from 'node:test'
import assert from 'node:assert/strict'
import { __test__ } from '../src/dte/draft-service.js'

test('genera el primer número de control DTE-01 de prueba', () => {
  assert.equal(
    __test__.nextControlNumber(null),
    'DTE-01-M001P001-000000000000001',
  )
})

test('incrementa la secuencia del número de control', () => {
  assert.equal(
    __test__.nextControlNumber('DTE-01-M001P001-000000000000009'),
    'DTE-01-M001P001-000000000000010',
  )
})
