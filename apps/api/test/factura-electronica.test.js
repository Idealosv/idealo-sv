import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFacturaElectronica, validateFacturaElectronica } from '../src/dte/factura-electronica.js'

const emisor = {
  nit: '06142812971032',
  nrc: '1234567',
  nombre: 'EMISOR DE PRUEBAS, S.A. DE C.V.',
  codActividad: '73100',
  descActividad: 'Publicidad',
  nombreComercial: 'EMISOR PRUEBAS',
  direccion: { departamento: '06', municipio: '23', distrito: '01', complemento: 'Dirección usada solamente para pruebas' },
  telefono: '22223333',
  correo: 'pruebas@example.com',
  codEstable: 'M001',
  codPuntoVenta: 'P001',
}

function build(overrides = {}) {
  return buildFacturaElectronica({
    emisor,
    receptor: null,
    numeroControl: 'DTE-01-M001P001-000000000000001',
    codigoGeneracion: '8f80b2c5-9fb7-48c5-b9fd-8cc2beca4949',
    emittedAt: new Date(2026, 7, 22, 10, 30, 45),
    totalLetras: 'CIENTO TRECE 00/100 DÓLARES',
    items: [{ descripcion: 'Servicio publicitario de prueba', cantidad: 1, precioUni: 113 }],
    ...overrides,
  })
}

test('construye una Factura Electrónica v2 exclusivamente para ambiente de pruebas', () => {
  const dte = build()
  assert.equal(dte.identificacion.version, 2)
  assert.equal(dte.identificacion.ambiente, '00')
  assert.equal(dte.identificacion.tipoDte, '01')
  assert.equal(dte.identificacion.codigoGeneracion, '8F80B2C5-9FB7-48C5-B9FD-8CC2BECA4949')
  assert.equal(validateFacturaElectronica(dte), true)
})

test('calcula partidas, total gravado e IVA incluido con precisión monetaria', () => {
  const dte = build({
    totalLetras: 'CIENTO CINCUENTA Y OCHO 20/100 DÓLARES',
    items: [
      { descripcion: 'Diseño', cantidad: 2, precioUni: 56.5 },
      { descripcion: 'Impresión', cantidad: 1, precioUni: 50, montoDescu: 4.8 },
    ],
  })
  assert.equal(dte.resumen.totalGravada, 158.2)
  assert.equal(dte.resumen.totalPagar, 158.2)
  assert.equal(dte.resumen.totalIva, 18.2)
  assert.deepEqual(dte.cuerpoDocumento.map((item) => item.numItem), [1, 2])
})

test('rechaza partidas vacías y datos fiscales incompletos del emisor', () => {
  assert.throws(() => build({ items: [] }), /entre 1 y 2000 partidas/)
  assert.throws(() => build({ emisor: { ...emisor, nrc: '' } }), /NRC del emisor/)
})

test('rechaza un número de control que no cumple el esquema oficial', () => {
  assert.throws(() => build({ numeroControl: 'DTE-01-INVALIDO' }), /numeroControl no cumple/)
})
