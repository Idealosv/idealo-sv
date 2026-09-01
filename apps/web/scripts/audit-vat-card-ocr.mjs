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
assert.match(engineSource, /export function mergeVatReadings/)
assert.match(pipelineSource, /VAT_FIELD_REGIONS/)
assert.match(pipelineSource, /name:/)
assert.match(pipelineSource, /nit:/)
assert.match(pipelineSource, /nrc:/)
assert.match(pipelineSource, /activity:/)
assert.match(pipelineSource, /address:/)
assert.match(pipelineSource, /createVatFieldVariants/)
assert.match(pipelineSource, /splitCombinedVatImageV2/)
assert.match(pipelineSource, /preprocessVatField/)
assert.match(scannerSource, /motor v2/i)
assert.match(scannerSource, /readVariantSet/)
assert.match(scannerSource, /Segunda lectura enfocada solo en campos pendientes/)
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

assert.equal(normalizeContributorName(`NOMBRE DEL CONTRIBUYENTE\nCALDERON GONZALEZ, CARLOS ALFREDO`), 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.equal(normalizeTaxId('No. IDENTIFICACION TRIBUTARIA 0101-230174-101-6'), '0101-230174-101-6')
assert.equal(normalizeNrc('N° DE REGISTRO (NRC) 124439-1'), '124439-1')
assert.equal(normalizeNrc('12-1'), '', 'un número corto de dirección nunca debe aceptarse como NRC')

const activities = parseActivities(`
GIRO O ACTIVIDAD ECONOMICA
PRIMARIA: REPARACION MECANICA DE VEHICULOS AUTOMOTORES
SECUNDARIA: VENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES
TERCIARIA:
`)
assert.equal(activities.length, 2)
assert.match(activities[0].name, /Reparación mecánica/i)
assert.match(activities[1].name, /Venta de partes/i)

const address = normalizeAddress(`
DIRECCION DE CASA MATRIZ
2° CALLE ORIENTE, COL. SANTA MARIA, # 1, AHUACHAPAN, AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
`)
assert.match(address, /CALLE ORIENTE/i)
assert.doesNotMatch(address, /CATEGORIA/i)

const result = buildVatCardResult({
  name: 'NOMBRE DEL CONTRIBUYENTE\nCALDERON GONZALEZ, CARLOS ALFREDO',
  nit: '0101-230174-101-6',
  nrc: '124439-1',
  activity: 'PRIMARIA: REPARACION MECANICA DE VEHICULOS AUTOMOTORES\nSECUNDARIA: VENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES',
  address: 'DIRECCION DE CASA MATRIZ\n2° CALLE ORIENTE, COL. SANTA MARIA, # 1, AHUACHAPAN, AHUACHAPAN',
})
assert.equal(result.name, 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.equal(result.nit, '0101-230174-101-6')
assert.equal(result.nrc, '124439-1')
assert.equal(result.additional_activities.length, 1)
assert.equal(result.ready_for_dte03, true)

const isolated = buildVatCardResult({
  name: 'CALDERON GONZALEZ, CARLOS ALFREDO',
  nit: '0101-230174-101-6',
  nrc: '12-1',
  activity: 'REPARACION MECANICA DE VEHICULOS AUTOMOTORES',
  address: '12° CALLE ORIENTE, COL. SANTA MARIA, # 1, AHUACHAPAN',
})
assert.equal(isolated.nrc, '')
assert.ok(isolated.missing.includes('NRC'))
assert.equal(isolated.ready_for_dte03, false)

console.log('✓ OCR IVA v2: lectura aislada por campo, NRC seguro, dos giros y dirección verificados')
