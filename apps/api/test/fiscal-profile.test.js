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

test('acepta NIT salvadoreño de persona natural con 9 dígitos', () => {
  const status = getIssuerReadiness({ ...company, nit: '07457849-9' })
  assert.equal(status.ready, true)
})

test('rechaza datos fiscales del emisor con formato inválido', () => {
  const status = getIssuerReadiness({
    ...company,
    nit: '123',
    phone: '7000',
    email: 'correo-invalido',
    establishment_code: 'M01',
  })
  assert.equal(status.ready, false)
  assert.ok(status.invalid.includes('NIT debe contener 9 o 14 dígitos'))
  assert.ok(status.invalid.includes('teléfono debe contener 8 dígitos'))
  assert.ok(status.invalid.includes('correo inválido'))
  assert.ok(status.invalid.includes('código de establecimiento debe contener 4 caracteres alfanuméricos'))
})

test('normaliza datos del emisor antes de construir DTE-01', () => {
  const normalized = {
    ...company,
    nit: '0614-281297-103-2',
    nrc: '123456-7',
    phone: '2222-3333',
    email: ' DTE@EXAMPLE.COM ',
    establishment_code: 'm001',
    point_of_sale_code: 'p001',
  }
  const dte = buildFacturaFromRecords({
    company: normalized,
    numeroControl: 'DTE-01-M001P001-000000000000001',
    totalLetras: 'UNO 00/100 DÓLARES',
    items: [{ descripcion: 'Prueba', cantidad: 1, precioUni: 1 }],
  })
  assert.equal(dte.emisor.nit, '06142812971032')
  assert.equal(dte.emisor.nrc, '1234567')
  assert.equal(dte.emisor.telefono, '22223333')
  assert.equal(dte.emisor.correo, 'dte@example.com')
  assert.equal(dte.emisor.codEstable, 'M001')
  assert.equal(dte.emisor.codPuntoVenta, 'P001')
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
  assert.equal(dte.receptor.numDocumento, '000000000')
  assert.equal(dte.receptor.nrc, null)
  assert.equal(dte.receptor.direccion.distrito, '01')
})

test('impide construir DTE-01 cuando el emisor tiene datos inválidos', () => {
  assert.throws(() => buildFacturaFromRecords({
    company: { ...company, nit: '123' },
    numeroControl: 'DTE-01-M001P001-000000000000004',
    totalLetras: 'UNO 00/100 DÓLARES',
    items: [{ descripcion: 'Prueba', cantidad: 1, precioUni: 1 }],
  }), /NIT debe contener 9 o 14 dígitos/)
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
