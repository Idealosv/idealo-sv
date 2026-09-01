import assert from 'node:assert/strict'
import fs from 'node:fs'

const parserSource = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')
const combinedImage = fs.readFileSync(new URL('../src/vatCombinedImage.js', import.meta.url), 'utf8')
const extraActivitiesHost = fs.readFileSync(new URL('../src/ClientAdditionalActivitiesHost.jsx', import.meta.url), 'utf8')
const mainSource = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../../../supabase/migrations/20260901053000_client_three_business_activities.sql', import.meta.url), 'utf8')

assert.match(parserSource, /NAME_LABEL/)
assert.match(parserSource, /NRC_LABEL/)
assert.match(parserSource, /function findName/)
assert.match(parserSource, /function isContributorNameCandidate/)
assert.match(parserSource, /function plausibleContributorNameShape/)
assert.match(parserSource, /function findActivities/)
assert.match(parserSource, /additional_activities/)
assert.match(parserSource, /function cleanAddress/)
assert.match(parserSource, /function suspiciousName/)
assert.match(parserSource, /function suspiciousAddress/)
assert.match(parserSource, /review_fields/)
assert.match(parserSource, /export function extractVatNit/)
assert.match(parserSource, /normalizeOcrDigits/)
assert.match(scanner, /recoverLegacyCardText/)
assert.match(scanner, /applyManualCorrections/)
assert.match(scanner, /Revisión \/ corrección manual/)
assert.match(scanner, /Giro 2/)
assert.match(scanner, /Giro 3/)
assert.match(scanner, /idealo-vat-additional-activities/)
assert.match(scanner, /REVISAR/)
assert.match(scanner, /review_fields/)
assert.match(scanner, /\[9, 14\]\.includes\(digits\.length\)/)
assert.match(scanner, /document_type: isHomologatedDui \? '13' : '36'/)
assert.match(scanner, /disabled=\{!resolvedResult\?\.ready_for_dte03\}/)
assert.match(scanner, /splitCombinedVatImage/)
assert.match(scanner, /Una imagen con ambas caras/)
assert.match(scanner, /Separada automáticamente/)
assert.match(scanner, /arriba \/ abajo/)
assert.match(scanner, /izquierda \/ derecha/)
assert.match(combinedImage, /export async function splitCombinedVatImage/)
assert.match(combinedImage, /chooseSplitOrientation/)
assert.match(combinedImage, /findHorizontalGap/)
assert.match(combinedImage, /findVerticalGap/)
assert.match(combinedImage, /trimRectToCard/)
assert.match(combinedImage, /autoTrimmed/)
assert.match(combinedImage, /targetMinWidth = 1500/)
assert.match(combinedImage, /cropToFile/)
assert.match(combinedImage, /tarjeta-iva-frente\.jpg/)
assert.match(combinedImage, /tarjeta-iva-reverso\.jpg/)
assert.match(extraActivitiesHost, /Giro 2/)
assert.match(extraActivitiesHost, /Giro 3/)
assert.match(extraActivitiesHost, /activity_code_2/)
assert.match(extraActivitiesHost, /activity_code_3/)
assert.match(extraActivitiesHost, /DTE_ACTIVITIES/)
assert.match(mainSource, /ClientAdditionalActivitiesHost/)
assert.match(migration, /add column if not exists activity_code_2 text/)
assert.match(migration, /add column if not exists business_activity_2 text/)
assert.match(migration, /add column if not exists activity_code_3 text/)
assert.match(migration, /add column if not exists business_activity_3 text/)

const executable = parserSource.replace(
  "import { DTE_ACTIVITIES } from './dteCatalogs'",
  "const DTE_ACTIVITIES = [{ code: '731000', name: 'Servicios de publicidad' }, { code: '181100', name: 'Actividades de impresión' }, { code: '452000', name: 'Reparación mecánica de vehículos automotores' }]",
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
assert.equal(traditional.name, 'GONZALEZ ARTERO, JAIME OMAR')
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

const labelledContributor = parseVatCardSides(`
MINISTERIO DE HACIENDA
DIRECCION GENERAL DE IMPUESTOS INTERNOS
NOMBRE DEL CONTRIBUYENTE
CALDERON GONZALEZ, CARLOS ALFREDO
No. DE IDENTIFICACION TRIBUTARIA (NIT)
0101-230174-101-6
N° DE REGISTRO (NRC)
124439-1
GIRO O ACTIVIDAD ECONOMICA
PRIMARIA: REPARACION MECANICA DE VEHICULOS AUTOMOTORES
SECUNDARIA: VENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES
TERCIARIA:
`, `
DIRECCION DE CASA MATRIZ
2A CALLE ORIENTE, COL. SANTA MARIA, #1, AHUACHAPAN, AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
`)
assert.equal(labelledContributor.name, 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.notEqual(labelledContributor.name, labelledContributor.business_activity)
assert.doesNotMatch(labelledContributor.name, /VENTA|REPARACION|ACCESORIOS/i)
assert.equal(labelledContributor.nrc, '124439-1')
assert.match(labelledContributor.business_activity, /reparación|reparacion/i)

const garbageName = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
I poo ode
NIT
0101-230174-101-6
NRC
124439-1
GIRO O ACTIVIDAD ECONOMICA
REPARACION MECANICA DE VEHICULOS AUTOMOTORES
`, noisyBack)
assert.equal(garbageName.name, '')
assert.ok(garbageName.missing.includes('razón social'))
assert.equal(garbageName.ready_for_dte03, false)

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

const threeActivities = parseVatCardSides(`
NOMBRE DEL CONTRIBUYENTE
COMERCIAL EJEMPLO, S.A. DE C.V.
NIT
0614-010101-001-2
NRC
123456-7
GIRO O ACTIVIDAD ECONOMICA
SERVICIOS DE PUBLICIDAD
ACTIVIDADES DE IMPRESION
REPARACION MECANICA DE VEHICULOS AUTOMOTORES
CATEGORIA DE CONTRIBUYENTE: OTRO
`, noisyBack)
assert.equal(threeActivities.activity_code, '731000')
assert.equal(threeActivities.additional_activities.length, 2)
assert.equal(threeActivities.additional_activities[0].code, '181100')
assert.equal(threeActivities.additional_activities[1].code, '452000')
assert.match(threeActivities.additional_activities[0].name, /impresi/i)
assert.match(threeActivities.additional_activities[1].name, /reparación|reparacion/i)

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
2A CALLE ORIENTE, COL. SANTA MARIA, #4, AHUACHAPAN LE A AN R Q 03 I
CATEGORIA DE CONTRIBUYENTE: OTRO
`)
assert.doesNotMatch(addressNoise.address, /LE A AN R Q 03 I$/i)

const contaminated = parseVatCardSides(`
MINISTERIO DE HACIENDA
É DARIA: VENTA DE PARTES. PI A Y ACCESORIOS NUEVOS PARA VEHICULOS ____ 1 Y
NIT
0101-230174-101-6
NRC
44997-1
GIRO O ACTIVIDAD ECONOMICA
REPARACION MECANICA DE VEHICULOS AUTOMOTORES
`, `
DIRECCION DE CASA MATRIZ
2A CALLE ORIENTE, COL. SANTA MARIA, 4 1, AHUACHAPAN, AHUACHAPAN LE A AN R Q 03 I
CATEGORIA DE CONTRIBUYENTE: OTRO
`)
assert.equal(contaminated.name, '')
assert.ok(contaminated.missing.includes('razón social'))
assert.equal(contaminated.ready_for_dte03, false)
assert.doesNotMatch(contaminated.address, /LE A AN R Q 03 I$/i)

assert.equal(extractVatNit('DUI O1234567 8'), '01234567-8')
assert.equal(extractVatNit('NIT O142 78I234 1O1 I'), '0142-781234-101-1')

const unsafe = parseVatCardSides(`NOMBRE DEL CONTRIBUYENTE\nGONZALEZ ARTERO, JAIME OMAR\nDUI\n01234567-8\nNRC\n216060-8\nGIRO O ACTIVIDAD ECONOMICA\nPUBLICIDAD`, 'DIRECCION GENERAL DE IMPUESTOS INTERNOS')
assert.equal(unsafe.address, '')
assert.equal(unsafe.ready_for_dte03, false)

console.log('✓ OCR IVA: autoencuadre, nombre confiable, ambas caras, tres giros y validación de ruido verificados')
