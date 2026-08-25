import assert from 'node:assert/strict'
import fs from 'node:fs'

const parserSource = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(parserSource, /DIRECCI\[ÓO\]N\\s\+DE\\s\+CASA\\s\+MATRIZ/)
assert.match(parserSource, /DIRECCI\[ÓO\]N\\s\+GENERAL\\s\+DE\\s\+IMPUESTOS\\s\+INTERNOS/)
assert.match(parserSource, /normalizeOcrDigits/)
assert.match(parserSource, /allowActivityValue/)
assert.match(parserSource, /cleanName/)
assert.match(parserSource, /ready_for_dte03:\s*missing\.length\s*===\s*0/)
assert.match(scanner, /parseVatCardSides\(frontOcr\.data\.text \|\| '', backOcr\.data\.text \|\| ''\)/)
assert.match(scanner, /disabled=\{!result\.ready_for_dte03\}/)

const executable = parserSource.replace(
  "import { DTE_ACTIVITIES } from './dteCatalogs'",
  "const DTE_ACTIVITIES = [{ code: '731000', name: 'Servicios de publicidad' }, { code: '181100', name: 'Actividades de impresión' }]",
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`
const { parseVatCardSides } = await import(moduleUrl)

const noisyFront = `
MINISTERIO DE HACIENDA
DIRECCION GENERAL DE IMPUESTOS INTERNOS
NOMBRE DEL CONTRIBUYENTE
ÉS GONZALEZ ARTERO, JAIME OMAR I
NO. DE IDENTIFICACION TRIBUTARIA (NIT)
O142-78I234-1O1-I
N° DE REGISTRO (NRC)
216060-8
GIRO O ACTIVIDAD ECONOMICA
ACTIVIDADES DE IMPRESION I
`
const noisyBack = `
DIRECCION DE CASA MATRIZ
AV. DURAN, CTGO. AL N° 2-8, SEGUNDA CUADRA, DISTRITO DE AHUACHAPAN, MUNICIPIO DE AHUACHAPAN CENTRO, DEPARTAMENTO DE AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
DIRECCION GENERAL DE IMPUESTOS INTERNOS
`

const parsed = parseVatCardSides(noisyFront, noisyBack)
assert.equal(parsed.name, 'GONZALEZ ARTERO, JAIME OMAR')
assert.equal(parsed.nit, '0142-781234-101-1')
assert.equal(parsed.nrc, '216060-8')
assert.match(parsed.business_activity, /impresi/i)
assert.match(parsed.address, /AV\. DURAN/i)
assert.doesNotMatch(parsed.address, /IMPUESTOS INTERNOS/i)
assert.equal(parsed.ready_for_dte03, true)

const unsafe = parseVatCardSides(noisyFront, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)

console.log('✓ OCR IVA: NIT con confusiones O/I, nombre limpio, giro real y dirección casa matriz verificados')
