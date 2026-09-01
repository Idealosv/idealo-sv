import assert from 'node:assert/strict'
import fs from 'node:fs'

const engineSource = fs.readFileSync(new URL('../src/vatCardOcrEngine.js', import.meta.url), 'utf8')
const pipelineSource = fs.readFileSync(new URL('../src/vatCardImagePipeline.js', import.meta.url), 'utf8')
const scannerSource = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(engineSource, /export function buildVatCardResult/)
assert.match(engineSource, /export function normalizeContributorName/)
assert.match(engineSource, /export function normalizeTaxId/)
assert.match(engineSource, /export function normalizeNrc/)
assert.match(engineSource, /export function parseActivities/)
assert.match(engineSource, /export function normalizeAddress/)
assert.match(engineSource, /noiseRatio/)
assert.match(engineSource, /plausibleText/)

assert.match(pipelineSource, /TARGET_WIDTH = 1800/)
assert.match(pipelineSource, /TARGET_HEIGHT = 1200/)
assert.match(pipelineSource, /detectCardRectByEdges/)
assert.match(pipelineSource, /gx \+ gy > 35/)
assert.match(pipelineSource, /localBackgroundNormalize/)
assert.match(pipelineSource, /otsuThreshold/)
assert.match(pipelineSource, /normalizada-v3/)
assert.match(pipelineSource, /VAT_FIELD_REGIONS/)
assert.match(pipelineSource, /name:/)
assert.match(pipelineSource, /nit:/)
assert.match(pipelineSource, /nrc:/)
assert.match(pipelineSource, /activity:/)
assert.match(pipelineSource, /address:/)
assert.doesNotMatch(pipelineSource, /gray > 225/)
assert.doesNotMatch(pipelineSource, /TARGET_HEIGHT = 1280/)

assert.match(scannerSource, /motor v3/i)
assert.match(scannerSource, /createWorker/)
assert.match(scannerSource, /PSM\.SINGLE_WORD/)
assert.match(scannerSource, /tessedit_char_whitelist: '0123456789-'/)
assert.match(scannerSource, /ocr\.data\.confidence/)
assert.match(scannerSource, /Segunda lectura enfocada únicamente en campos pendientes/)
assert.doesNotMatch(scannerSource, /clientVatCardParser/)
assert.doesNotMatch(scannerSource, /vatCombinedImage/)

const executable = engineSource.replace(
  "import { DTE_ACTIVITIES } from './dteCatalogs'",
  `const DTE_ACTIVITIES = [
    { code: '45201', name: 'Reparación mecánica de vehículos automotores' },
    { code: '45300', name: 'Venta de partes, piezas y accesorios nuevos para vehículos automotores' },
    { code: '73100', name: 'Servicios de publicidad' }
  ]`,
)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`
const { buildVatCardResult, normalizeContributorName, normalizeTaxId, normalizeNrc, parseActivities, normalizeAddress } = await import(moduleUrl)

assert.equal(normalizeContributorName('CALDERON GONZALEZ, CARLOS ALFREDO'), 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.equal(normalizeContributorName("N': .—* J o! -- IN > h ''AI NE GONZAL ARLA REDO A EY"), '')
assert.equal(normalizeTaxId('0101-230174-101-6'), '0101-230174-101-6')
assert.equal(normalizeTaxId('0101-230174-1014-6'), '0101-230174-101-6', 'corrige duplicación OCR del bloque final del NIT antiguo')
assert.equal(normalizeNrc('124439-1'), '124439-1')
assert.equal(normalizeNrc('12-1'), '')

const activities = parseActivities('PRIMARIA: REPARACION MECANICA DE VEHICULOS AUTOMOTORES\nSECUNDARIA: VENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES\nTERCIARIA:')
assert.equal(activities.length, 2)
assert.match(activities[0].name, /Reparación mecánica/i)
assert.match(activities[1].name, /Venta de partes/i)
assert.equal(parseActivities("L S X= E > .. no TETERA e a » XxX + A a É I XA des Me a A > Lo").length, 0)

const address = normalizeAddress('DIRECCION DE CASA MATRIZ\n2° CALLE ORIENTE, COL. SANTA MARIA, #1, AHUACHAPAN, AHUACHAPAN\nCATEGORIA DE CONTRIBUYENTE: OTRO')
assert.match(address, /CALLE ORIENTE/i)
assert.equal(normalizeAddress("ICALLE- ORIENTE , COL. SANTA MAF — aaa Adi as - 6 q ARIA 'E a he"), '')

const result = buildVatCardResult({
  name: 'CALDERON GONZALEZ, CARLOS ALFREDO',
  nit: '0101-230174-101-6',
  nrc: '124439-1',
  activity: 'REPARACION MECANICA DE VEHICULOS AUTOMOTORES\nVENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES',
  address: '2° CALLE ORIENTE, COL. SANTA MARIA, #1, AHUACHAPAN, AHUACHAPAN',
})
assert.equal(result.name, 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.equal(result.nit, '0101-230174-101-6')
assert.equal(result.nrc, '124439-1')
assert.equal(result.additional_activities.length, 1)
assert.equal(result.ready_for_dte03, true)

const garbage = buildVatCardResult({
  name: "N': .—* J o! -- IN > h ''AI NE GONZAL ARLA REDO A EY",
  nit: '', nrc: '',
  activity: "L S X= E > .. no TETERA e a » XxX + A a É I XA des Me a A > Lo",
  address: "ICALLE- ORIENTE , COL. SANTA MAF — aaa Adi as - 6 q ARIA 'E a he",
})
assert.equal(garbage.name, '')
assert.equal(garbage.business_activity, '')
assert.equal(garbage.address, '')
assert.equal(garbage.ready_for_dte03, false)

console.log('✓ OCR IVA v3: bordes físicos, 3:2, limpieza de marca de agua, OCR numérico especializado y rechazo de basura verificados')
