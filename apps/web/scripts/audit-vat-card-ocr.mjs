import assert from 'node:assert/strict'
import fs from 'node:fs'

const engineSource = fs.readFileSync(new URL('../src/vatCardOcrEngine.js', import.meta.url), 'utf8')
const pipelineSource = fs.readFileSync(new URL('../src/vatCardImagePipeline.js', import.meta.url), 'utf8')
const scannerSource = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(engineSource, /export function buildVatCardResult/)
assert.match(engineSource, /extractNameAfterLabel/)
assert.match(engineSource, /extractActivitySections/)
assert.match(engineSource, /extractAddressAfterLabel/)
assert.match(engineSource, /matchActivity/)
assert.match(engineSource, /strictFallback/)

assert.match(pipelineSource, /TARGET_WIDTH = 1800/)
assert.match(pipelineSource, /TARGET_HEIGHT = 1200/)
assert.match(pipelineSource, /normalizada-v4/)
assert.match(pipelineSource, /detectCardRectByConnectedEdges/)
assert.match(pipelineSource, /binaryComponents/)
assert.match(pipelineSource, /dilateBinary/)
assert.match(pipelineSource, /prepareSegmentedDigitLine/)
assert.match(pipelineSource, /expectedCount/)
assert.match(pipelineSource, /localBackgroundNormalize/)
assert.match(pipelineSource, /otsuThreshold/)
assert.match(pipelineSource, /fullFront/)
assert.match(pipelineSource, /fullBack/)
assert.doesNotMatch(pipelineSource, /detectCardRectByEdges/)

assert.match(scannerSource, /motor v4/i)
assert.match(scannerSource, /readWholeCardText/)
assert.match(scannerSource, /readSegmentedNumber/)
assert.match(scannerSource, /prepareSegmentedDigitLine/)
assert.match(scannerSource, /Reconstruyendo los 14 dígitos del NIT/)
assert.match(scannerSource, /Reconstruyendo los dígitos del NRC/)
assert.match(scannerSource, /Ningún texto dudoso se aplicará automáticamente/)
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

const fullFront = `
MINISTERIO DE HACIENDA
DIRECCION GENERAL DE IMPUESTOS INTERNOS
NUMERO DE REGISTRO DE CONTRIBUYENTES
NOMBRE DEL CONTRIBUYENTE
CALDERON GONZALEZ, CARLOS ALFREDO
No. DE IDENTIFICACION TRIBUTARIA (NIT) N° DE REGISTRO (NRC)
GIRO O ACTIVIDAD ECONOMICA
PRIMARIA: REPARACION MECANICA DE VEHICULOS AUTOMOTORES
SECUNDARIA: VENTA DE PARTES, PIEZAS Y ACCESORIOS NUEVOS PARA VEHICULOS AUTOMOTORES
TERCIARIA:
`
const fullBack = `
DIRECCION DE CASA MATRIZ
2° CALLE ORIENTE, COL. SANTA MARIA, #1, AHUACHAPAN,
AHUACHAPAN
CATEGORIA DE CONTRIBUYENTE: OTRO
FIRMA DEL FUNCIONARIO AUTORIZADO
`

assert.equal(normalizeContributorName(fullFront), 'CALDERON GONZALEZ, CARLOS ALFREDO')
assert.equal(normalizeContributorName("Eros couza Eicinucalirpos r 3 l I"), '')
assert.equal(normalizeContributorName("N': .—* J o! -- IN > h ''AI NE GONZAL ARLA REDO A EY"), '')
assert.equal(normalizeTaxId('01012301741016'), '0101-230174-101-6')
assert.equal(normalizeTaxId('0101-230174-101-6'), '0101-230174-101-6')
assert.equal(normalizeNrc('1244391'), '124439-1')
assert.equal(normalizeNrc('124439-1'), '124439-1')
assert.equal(normalizeNrc('12-1'), '')

const activities = parseActivities(fullFront)
assert.equal(activities.length, 2)
assert.match(activities[0].name, /Reparación mecánica/i)
assert.match(activities[1].name, /Venta de partes/i)
assert.equal(parseActivities('OTORES a y').length, 0)
assert.equal(parseActivities("L S X= E > .. no TETERA e a » XxX + A a É I XA des Me a A > Lo").length, 0)

const address = normalizeAddress(fullBack)
assert.match(address, /CALLE ORIENTE/i)
assert.match(address, /SANTA MARIA/i)
assert.equal(normalizeAddress("ICALLE- ORIENTE , COL. SANTA MAF — aaa Adi as - 6 q ARIA 'E a he"), '')

const expected = {
  name: 'CALDERON GONZALEZ, CARLOS ALFREDO',
  nit: '0101-230174-101-6',
  nrc: '124439-1',
}

for (let i = 0; i < 25; i += 1) {
  const prefix = i % 2 ? '  ' : '\n'
  const suffix = i % 3 === 0 ? '\nRF210A4199592' : ''
  const result = buildVatCardResult({
    name: `${prefix}${fullFront}${suffix}`,
    nit: i % 2 ? '01012301741016' : '0101-230174-101-6',
    nrc: i % 2 ? '1244391' : '124439-1',
    activity: `${prefix}${fullFront}${suffix}`,
    address: `${prefix}${fullBack}${suffix}`,
  })
  assert.equal(result.name, expected.name, `iteración ${i + 1}: nombre`)
  assert.equal(result.nit, expected.nit, `iteración ${i + 1}: NIT`)
  assert.equal(result.nrc, expected.nrc, `iteración ${i + 1}: NRC`)
  assert.equal(result.business_activity, 'Reparación mecánica de vehículos automotores', `iteración ${i + 1}: giro principal`)
  assert.equal(result.additional_activities.length, 1, `iteración ${i + 1}: giro secundario`)
  assert.match(result.address, /CALLE ORIENTE/i, `iteración ${i + 1}: dirección`)
  assert.equal(result.ready_for_dte03, true, `iteración ${i + 1}: DTE-03 listo`)
}

const garbage = buildVatCardResult({
  name: 'Eros couza Eicinucalirpos r 3 l I',
  nit: '',
  nrc: '',
  activity: 'OTORES a y',
  address: "ICALLE- ORIENTE , COL. SANTA MAF — aaa Adi as - 6 q ARIA 'E a he",
})
assert.equal(garbage.name, '')
assert.equal(garbage.business_activity, '')
assert.equal(garbage.address, '')
assert.equal(garbage.ready_for_dte03, false)

console.log('✓ OCR IVA v4: lectura anclada por etiquetas, segmentación numérica y 25 iteraciones de parser verificadas')
