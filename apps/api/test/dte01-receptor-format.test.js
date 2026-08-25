import test from 'node:test'
import assert from 'node:assert/strict'
import { mapClientToDteReceiver } from '../src/dte/fiscal-profile.js'

const baseClient = {
  name: 'RECEPTOR DE PRUEBA',
  document_type: '13',
  document_number: '01247267-9',
  nrc: '216060-8',
  activity_code: '73100',
  business_activity: 'Publicidad',
  department_code: '01',
  municipality_code: '14',
  district_code: '01',
  address: 'Dirección de prueba',
  phone: '7615-2616',
  email: 'cliente@example.com',
}

test('DTE-01 con DUI elimina guion y no envía NRC incompatible con tipo 13', () => {
  const receptor = mapClientToDteReceiver(baseClient)
  assert.equal(receptor.tipoDocumento, '13')
  assert.equal(receptor.numDocumento, '012472679')
  assert.equal(receptor.nrc, null)
  assert.equal(receptor.telefono, '76152616')
})

test('DTE-01 con NIT normaliza NIT y NRC sin caracteres especiales', () => {
  const receptor = mapClientToDteReceiver({
    ...baseClient,
    document_type: '36',
    document_number: '0614-2812-9710-32',
    nrc: '000216060-8',
  })
  assert.equal(receptor.numDocumento, '06142812971032')
  assert.equal(receptor.nrc, '2160608')
})
