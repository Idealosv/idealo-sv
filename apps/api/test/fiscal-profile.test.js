import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFacturaFromRecords, getIssuerReadiness, getReceiverReadiness } from '../src/dte/fiscal-profile.js'

const company = {
  name: 'IDEALO SV, S.A. DE C.V.', nit: '06142812971032', nrc: '1234567',
  trade_name: 'IDEALO SV', activity_code: '73100', business_activity: 'Publicidad',
  department_code: '06', municipality_code: '23', district_code: '01',
  address: 'Dirección de prueba', phone: '22223333', email: 'dte@example.com',
  establishment_code: 'M001', point_of_sale_code: 'P001',
}

const client = {
  name: 'CLIENTE DE PRUEBA', document_type: '13', document_number: '00000000-0',
  nrc: null, activity_code: '62010', business_activity: 'Servicios informáticos',
  department_code: '06', municipality_code: '23', district_code: '01',
  address: 'Dirección del cliente', phone: '70000000', email: 'cliente@example.com',
}

test('detecta expedientes fiscales completos e incompletos', () => {
  assert.equal(getIssuerReadiness(company).ready, true)
  assert.equal(getReceiverReadiness(client).ready, true)
  assert.deepEqual(getIssuerReadiness({ ...company, nit: '' }).missing, ['NIT'])
})

test('construye DTE-01 de prueba desde empresa y cliente registrados', () => {
  const dte = buildFacturaFromRecords({
    company, client,
    numeroControl: 'DTE-01-M001P001-000000000000002',
    codigoGeneracion: '6d5b010d-90a4-4aca-b277-0064165ed215',
    totalLetras: 'CIENTO TRECE 00/100 DÓLARES',
    items: [{ descripcion: 'Servicio de prueba', cantidad: 1, precioUni: 113 }],
  })
  assert.equal(dte.identificacion.ambiente, '00')
  assert.equal(dte.emisor.nit, company.nit)
  assert.equal(dte.receptor.numDocumento, client.document_number)
  assert.equal(dte.receptor.direccion.distrito, '01')
})

test('no incorpora secretos de firma ni credenciales al DTE', () => {
  const contaminated = { ...company, certificate_password: 'secreto', api_password: 'secreto' }
  const dte = buildFacturaFromRecords({
    company: contaminated,
    numeroControl: 'DTE-01-M001P001-000000000000003',
    totalLetras: 'UNO 00/100 DÓLARES',
    items: [{ descripcion: 'Prueba', cantidad: 1, precioUni: 1 }],
  })
  assert.equal(JSON.stringify(dte).includes('secreto'), false)
})
