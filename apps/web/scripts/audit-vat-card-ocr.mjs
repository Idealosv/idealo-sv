import assert from 'node:assert/strict'
import { parseVatCardSides } from '../src/clientVatCardParser.js'

const front = `
MINISTERIO DE HACIENDA
DIRECCION GENERAL DE IMPUESTOS INTERNOS
NUMERO DE REGISTRO DE CONTRIBUYENTES
NOMBRE DEL CONTRIBUYENTE
GONZALEZ ARTERO, JAIME OMAR
No. DE IDENTIFICACION TRIBUTARIA (NIT)
0101-010101-101-1
N° DE REGISTRO (NRC)
351249-7
GIRO O ACTIVIDAD ECONOMICA
SERVICIOS DE PUBLICIDAD
`
const back = `
DIRECCION DE CASA MATRIZ
AV. PRINCIPAL, BARRIO EL CENTRO, AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
FIRMA DEL FUNCIONARIO AUTORIZADO
DIRECCION GENERAL DE IMPUESTOS INTERNOS
`

const parsed = parseVatCardSides(front, back)
assert.equal(parsed.nit, '0101-010101-101-1')
assert.equal(parsed.nrc, '351249-7')
assert.equal(parsed.name, 'GONZALEZ ARTERO, JAIME OMAR')
assert.match(parsed.address, /AV\. PRINCIPAL/i)
assert.doesNotMatch(parsed.address, /IMPUESTOS INTERNOS/i)
assert.equal(parsed.ready_for_dte03, true)

const unsafe = parseVatCardSides(front, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)
assert.ok(unsafe.missing.includes('dirección de casa matriz'))

console.log('✓ OCR IVA: estructura frente/reverso y bloqueo de dirección institucional verificados')
