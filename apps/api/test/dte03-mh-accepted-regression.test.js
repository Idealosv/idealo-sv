import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCreditoFiscal, validateCreditoFiscal } from '../src/dte/credito-fiscal.js'

// Contrato sanitizado a partir de un DTE-03 realmente PROCESADO por Hacienda TEST
// el 25/08/2026. No contiene datos personales del emisor ni del receptor.
test('DTE-03 conserva el contrato que MH TEST aceptó', () => {
  const dte = buildCreditoFiscal({
    numeroControl: 'DTE-03-M001P001-000000000000002',
    codigoGeneracion: 'EFC3C108-91DA-4604-A69E-A7BD10965841',
    emittedAt: new Date(2026, 7, 25, 6, 27, 17),
    condicionOperacion: 1,
    totalLetras: 'DIEZ 50/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA',
    payment: { codigo: '01', montoPago: 10.5 },
    emisor: {
      nit: '06141401231019',
      nrc: '1234567',
      nombre: 'EMPRESA PRUEBA',
      nombreComercial: 'IDEALO SV TEST',
      codActividad: '73100',
      descActividad: 'PUBLICIDAD',
      direccion: { departamento: '01', municipio: '14', distrito: '01', complemento: 'DIRECCIÓN EMISOR TEST' },
      telefono: '24000000',
      correo: 'facturacion@example.com',
      codEstable: 'M001',
      codPuntoVenta: 'P001',
    },
    receptor: {
      nit: '012345678',
      nrc: '2160608',
      nombre: 'CLIENTE PRUEBA',
      nombreComercial: 'CLIENTE TEST',
      codActividad: '73100',
      descActividad: 'Publicidad',
      direccion: { departamento: '01', municipio: '14', distrito: '02', complemento: 'DIRECCIÓN RECEPTOR TEST' },
      telefono: '24000001',
      correo: 'cliente@example.com',
    },
    items: [{
      cantidad: 1,
      precioUni: 9.29,
      descripcion: 'camisas',
      tipoItem: 1,
      uniMedida: 59,
      tipoVenta: 'gravada',
    }],
  })

  assert.equal(validateCreditoFiscal(dte), true)
  assert.deepEqual(dte.identificacion, {
    version: 3,
    ambiente: '00',
    tipoDte: '03',
    numeroControl: 'DTE-03-M001P001-000000000000002',
    codigoGeneracion: 'EFC3C108-91DA-4604-A69E-A7BD10965841',
    tipoModelo: 1,
    tipoOperacion: 1,
    tipoContingencia: null,
    motivoContin: null,
    fecEmi: '2026-08-25',
    horEmi: '06:27:17',
    tipoMoneda: 'USD',
  })

  assert.deepEqual(dte.emisor.direccion, {
    departamento: '01',
    municipio: '14',
    complemento: 'DIRECCIÓN EMISOR TEST',
  })
  assert.deepEqual(dte.receptor.direccion, {
    departamento: '01',
    municipio: '14',
    complemento: 'DIRECCIÓN RECEPTOR TEST',
  })
  assert.equal(Object.hasOwn(dte.emisor.direccion, 'distrito'), false)
  assert.equal(Object.hasOwn(dte.receptor.direccion, 'distrito'), false)

  assert.deepEqual(dte.cuerpoDocumento[0], {
    numItem: 1,
    tipoItem: 1,
    numeroDocumento: null,
    cantidad: 1,
    codigo: null,
    codTributo: null,
    uniMedida: 59,
    descripcion: 'camisas',
    precioUni: 9.29,
    montoDescu: 0,
    ventaNoSuj: 0,
    ventaExenta: 0,
    ventaGravada: 9.29,
    tributos: ['20'],
    psv: 0,
    noGravado: 0,
  })

  assert.equal(dte.resumen.totalGravada, 9.29)
  assert.equal(dte.resumen.subTotalVentas, 9.29)
  assert.equal(dte.resumen.tributos[0].codigo, '20')
  assert.equal(dte.resumen.tributos[0].valor, 1.21)
  assert.equal(dte.resumen.montoTotalOperacion, 10.5)
  assert.equal(dte.resumen.totalPagar, 10.5)
  assert.equal(dte.resumen.condicionOperacion, 1)
  assert.deepEqual(dte.resumen.pagos, [{
    codigo: '01',
    montoPago: 10.5,
    referencia: null,
    plazo: null,
    periodo: null,
  }])
})
