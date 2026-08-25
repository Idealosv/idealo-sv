import assert from 'node:assert/strict'
import fs from 'node:fs'

const parserSource = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(parserSource, /DIRECCI\[ÓO\]N\\s\+DE\\s\+CASA\\s\+MATRIZ/)
assert.match(parserSource, /DIRECCI\[ÓO\]N\\s\+GENERAL\\s\+DE\\s\+IMPUESTOS\\s\+INTERNOS/)
assert.match(parserSource, /export function extractVatNit/)
assert.match(parserSource, /normalizeOcrDigits/)
assert.match(parserSource, /allowActivityValue/)
assert.match(parserSource, /cleanName/)
assert.match(parserSource, /ready_for_dte03:\s*missing\.length\s*===\s*0/)
assert.match(scanner, /recoverNitFromFront\(front\.file, setProgress\)/)
assert.match(scanner, /for \(let variant = 0; variant < 3; variant \+= 1\)/)
assert.match(scanner, /extractVatNit\(nitOcr\.data\.text \|\| ''\)/)
assert.doesNotMatch(scanner, /parseVatCardSides\(`\$\{frontOcr\.data\.text/)
assert.match(scanner, /NIT manual \(respaldo\)/)
assert.match(scanner, /digits\.length !== 14/)
assert.match(scanner, /disabled=\{!resolvedResult\?\.ready_for_dte03\}/)

const executable = parserSource.replace(
  "import { DTE_ACTIVITIES } from './dteCatalogs'",
  "const DTE_ACTIVITIES = [{ code: '731000', name: 'Servicios de publicidad' }, { code: '181100', name: 'Actividades de impresión' }]",
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`
const { extractVatNit, parseVatCardSides } = await import(moduleUrl)

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

const focusOnly = extractVatNit('NIT O142 78I234 1O1 I')
assert.equal(focusOnly, '0142-781234-101-1')

const originalWithoutNit = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
GONZALEZ ARTERO, JAIME OMAR
N° DE REGISTRO (NRC)
216060-8
GIRO O ACTIVIDAD ECONOMICA
PUBLICIDAD
`, noisyBack)
assert.equal(originalWithoutNit.business_activity, 'Servicios de publicidad')
assert.equal(originalWithoutNit.nit, '')
assert.ok(originalWithoutNit.missing.includes('NIT'))

const unsafe = parseVatCardSides(noisyFront, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)

console.log('✓ OCR IVA: NIT multifoco aislado, giro estable, respaldo manual y datos DTE-03 verificados')
