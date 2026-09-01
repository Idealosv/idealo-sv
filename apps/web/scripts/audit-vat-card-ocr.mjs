import assert from 'node:assert/strict'
import fs from 'node:fs'

const parserSource = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(parserSource, /NAME_LABEL/)
assert.match(parserSource, /NRC_LABEL/)
assert.match(parserSource, /function findName/)
assert.match(parserSource, /function cleanAddress/)
assert.match(parserSource, /export function extractVatNit/)
assert.match(parserSource, /normalizeOcrDigits/)
assert.match(scanner, /recoverLegacyCardText/)
assert.match(scanner, /applyManualCorrections/)
assert.match(scanner, /Revisión \/ corrección manual/)
assert.match(scanner, /\[9, 14\]\.includes\(digits\.length\)/)
assert.match(scanner, /document_type: isHomologatedDui \? '13' : '36'/)
assert.match(scanner, /disabled=\{!resolvedResult\?\.ready_for_dte03\}/)

const executable = parserSource.replace(
  "import { DTE_ACTIVITIES } from './dteCatalogs'",
  "const DTE_ACTIVITIES = [{ code: '731000', name: 'Servicios de publicidad' }, { code: '181100', name: 'Actividades de impresión' }]",
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`
const { extractVatNit, parseVatCardSides } = await import(moduleUrl)

const noisyBack = `
DIRECCION DE CASA MATRIZ
AV. DURAN, CTGO. AL N° 2-8, SEGUNDA CUADRA, DISTRITO DE AHUACHAPAN, MUNICIPIO DE AHUACHAPAN CENTRO, DEPARTAMENTO DE AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
DIRECCION GENERAL DE IMPUESTOS INTERNOS
`

const traditional = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
GONZALEZ ARTERO, JAIME OMAR
NIT
O142-78I234-1O1-I
NRC
216060-8
GIRO O ACTIVIDAD ECONOMICA
PUBLICIDAD
`, noisyBack)
assert.equal(traditional.nit, '0142-781234-101-1')
assert.equal(traditional.ready_for_dte03, true)

const homologated = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
GONZALEZ ARTERO, JAIME OMAR
NIT/DUI
O1234567-8
NRC
216060-8
GIRO O ACTIVIDAD ECONOMICA
PUBLICIDAD
`, noisyBack)
assert.equal(homologated.nit, '01234567-8')
assert.equal(homologated.nrc, '216060-8')
assert.equal(homologated.ready_for_dte03, true)
assert.match(homologated.business_activity, /publicidad/i)

const legacy = parseVatCardSides(`
MINISTERIO DE HACIENDA
DIRECCION GENERAL DE IMPUESTOS INTERNOS
PEREZ RAMIREZ, CARLOS ANDRES
NO. IDENTIFICACION TRIBUTARIA
0614-010101-001-2
N° REGISTRO NRC
123456-7
GIRO O ACTIVIDAD ECONOMICA
SERVICIOS DE PUBLICIDAD
`, `
2a CALLE ORIENTE, COL. SANTA MARIA, #4, AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
FIRMA DEL FUNCIONARIO
`)
assert.equal(legacy.name, 'PEREZ RAMIREZ, CARLOS ANDRES')
assert.equal(legacy.nit, '0614-010101-001-2')
assert.equal(legacy.nrc, '123456-7')
assert.match(legacy.business_activity, /publicidad/i)
assert.match(legacy.address, /CALLE ORIENTE/i)
assert.equal(legacy.ready_for_dte03, true)

const addressNoise = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
COMERCIAL EJEMPLO, S.A. DE C.V.
NIT
0614-010101-001-2
NRC
123456-7
GIRO O ACTIVIDAD ECONOMICA
PUBLICIDAD
`, `
DIRECCION DE CASA MATRIZ
2A CALLE ORIENTE, COL. SANTA MARIA, #4, AHUACHAPAN LE A AN
CATEGORIA DE CONTRIBUYENTE: OTRO
`)
assert.doesNotMatch(addressNoise.address, /LE A AN$/i)

assert.equal(extractVatNit('DUI O1234567 8'), '01234567-8')
assert.equal(extractVatNit('NIT O142 78I234 1O1 I'), '0142-781234-101-1')

const unsafe = parseVatCardSides(`NOMBRE DEL CONTRIBUYENTE\nGONZALEZ ARTERO, JAIME OMAR\nDUI\n01234567-8\nNRC\n216060-8\nGIRO O ACTIVIDAD ECONOMICA\nPUBLICIDAD`, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)

console.log('✓ OCR IVA: formatos actuales/antiguos, limpieza de dirección y revisión manual protegidos')
