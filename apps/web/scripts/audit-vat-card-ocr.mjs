import assert from 'node:assert/strict'
import fs from 'node:fs'

const parserSource = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(parserSource, /DIRECCI\[ÓO\]N\\s\+DE\\s\+CASA\\s\+MATRIZ/)
assert.match(parserSource, /export function extractVatNit/)
assert.match(parserSource, /normalizeOcrDigits/)
assert.match(scanner, /NIT \/ DUI homologado manual/)
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

assert.equal(extractVatNit('DUI O1234567 8'), '01234567-8')
assert.equal(extractVatNit('NIT O142 78I234 1O1 I'), '0142-781234-101-1')

const unsafe = parseVatCardSides(`NOMBRE DEL CONTRIBUYENTE\nGONZALEZ ARTERO, JAIME OMAR\nDUI\n01234567-8\nNRC\n216060-8\nGIRO O ACTIVIDAD ECONOMICA\nPUBLICIDAD`, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)

console.log('✓ OCR IVA: DUI/NIT homologado de 9 dígitos y NIT tradicional de 14 dígitos verificados')
