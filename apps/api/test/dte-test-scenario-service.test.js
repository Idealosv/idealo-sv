import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingDte01ScenarioCodes } from '../src/dte/test-scenario-service.js'

test('reconoce consumidor final, contado y servicio', () => {
  const codes = matchingDte01ScenarioCodes({
    receptor: null,
    cuerpoDocumento: [{ tipoItem: 2, montoDescu: 0, ventaExenta: 0, ventaNoSuj: 0 }],
    resumen: { condicionOperacion: 1, pagos: [{ codigo: '01' }] },
  })
  assert.deepEqual(codes.sort(), ['cash', 'consumer_no_id', 'services'].sort())
})

test('reconoce receptor, crédito, transferencia, descuento y varias partidas', () => {
  const codes = matchingDte01ScenarioCodes({
    receptor: { nombre: 'CLIENTE DE PRUEBA' },
    cuerpoDocumento: [
      { tipoItem: 1, montoDescu: 1, ventaExenta: 0, ventaNoSuj: 0 },
      { tipoItem: 2, montoDescu: 0, ventaExenta: 0, ventaNoSuj: 0 },
    ],
    resumen: { condicionOperacion: 2, pagos: [{ codigo: '05' }] },
  })
  for (const expected of ['consumer_identified', 'credit', 'transfer', 'discount', 'multi_item', 'goods', 'services']) {
    assert.ok(codes.includes(expected), `debe reconocer ${expected}`)
  }
})

test('reconoce exenta, no sujeta y pago electrónico', () => {
  const codes = matchingDte01ScenarioCodes({
    receptor: { nombre: 'CLIENTE' },
    cuerpoDocumento: [
      { tipoItem: 1, ventaExenta: 5, ventaNoSuj: 0 },
      { tipoItem: 1, ventaExenta: 0, ventaNoSuj: 3 },
    ],
    resumen: { condicionOperacion: 1, pagos: [{ codigo: '08' }] },
  })
  for (const expected of ['exempt', 'non_subject', 'electronic_payment']) {
    assert.ok(codes.includes(expected), `debe reconocer ${expected}`)
  }
})
