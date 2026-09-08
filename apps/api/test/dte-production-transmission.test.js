import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProductionReceptionPayload, productionConfirmation } from '../src/dte/transmit-production-service.js'

const document = {
  dte_type: '03',
  generation_code: 'abc-def',
  control_number: 'DTE-03-M001P001-000000000000001',
  signed_document: 'signed-jws',
  dte_payload: { identificacion: { version: 3, tipoDte: '03', ambiente: '01' } },
}

test('payload de PRODUCCIÓN usa ambiente 01 y conserva la identidad DTE', () => {
  assert.deepEqual(buildProductionReceptionPayload(document, 1), {
    ambiente: '01',
    idEnvio: 1,
    version: 3,
    tipoDte: '03',
    documento: 'signed-jws',
    codigoGeneracion: 'ABC-DEF',
  })
})

test('confirmación de PRODUCCIÓN exige el número de control completo', () => {
  assert.equal(
    productionConfirmation(document.control_number),
    'TRANSMITIR PRODUCCION DTE-03-M001P001-000000000000001',
  )
})
