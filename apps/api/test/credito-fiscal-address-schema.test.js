import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCreditoFiscal } from '../src/dte/credito-fiscal.js'

test('DTE-03 v3 omite distrito en direcciones de emisor y receptor', () => {
  const baseAddress = { departamento: '01', municipio: '01', distrito: '01', complemento: 'Ahuachapán' }
  const dte = buildCreditoFiscal({
    numeroControl: 'DTE-03-M001P001-000000000000001',
    codigoGeneracion: '754EE3D0-905C-405D-B477-2079F235A4CE',
    emittedAt: new Date('2026-08-25T12:00:00-06:00'),
    totalLetras: 'ONCE 30/100 DÓLARES',
    emisor: {
      nit: '06141401231019', nrc: '1234567', nombre: 'IDEALO SV',
      codActividad: '73100', descActividad: 'Publicidad',
      direccion: baseAddress, telefono: '24000000', correo: 'facturacion@example.com',
    },
    receptor: {
      nit: '012345678', nrc: '2160608', nombre: 'CLIENTE PRUEBA',
      codActividad: '73100', descActividad: 'Publicidad',
      direccion: baseAddress, telefono: '24000001', correo: 'cliente@example.com',
    },
    items: [{ cantidad: 1, precioUni: 10, descripcion: 'Servicio publicitario', tipoVenta: 'gravada' }],
  })

  assert.equal(dte.identificacion.version, 3)
  assert.equal(Object.hasOwn(dte.emisor.direccion, 'distrito'), false)
  assert.equal(Object.hasOwn(dte.receptor.direccion, 'distrito'), false)
  assert.deepEqual(dte.emisor.direccion, { departamento: '01', municipio: '01', complemento: 'Ahuachapán' })
})
