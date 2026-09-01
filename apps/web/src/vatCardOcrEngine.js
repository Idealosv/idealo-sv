import { DTE_ACTIVITIES } from './dteCatalogs'

const FIELD_NAMES = ['name', 'nit', 'nrc', 'activity', 'address']

export function buildVatCardResult(readings = {}) {
  const name = normalizeContributorName(readings.name)
  const nit = normalizeTaxId(readings.nit)
  const nrc = normalizeNrc(readings.nrc)
  const activities = parseActivities(readings.activity)
  const address = normalizeAddress(readings.address)
  const primary = activities[0] || null

  const result = {
    name,
    nit,
    nrc,
    business_activity: primary?.name || '',
    activity_code: primary?.code || '',
    additional_activities: activities.slice(1, 3),
    address,
    missing: [],
    review_fields: [],
    confidence: {
      name: confidenceFor('name', readings.name, name),
      nit: confidenceFor('nit', readings.nit, nit),
      nrc: confidenceFor('nrc', readings.nrc, nrc),
      business_activity: confidenceFor('activity', readings.activity, primary?.name || ''),
      address: confidenceFor('address', readings.address, address),
    },
  }

  if (!name) result.missing.push('razón social')
  if (!nit) result.missing.push('NIT')
  if (!nrc) result.missing.push('NRC')
  if (!result.business_activity) result.missing.push('giro / actividad')
  if (!address) result.missing.push('dirección de casa matriz')

  Object.entries(result.confidence).forEach(([field, score]) => {
    if (score > 0 && score < 0.72) result.review_fields.push(field)
  })

  result.ready_for_dte03 = result.missing.length === 0 && result.review_fields.length === 0
  return result
}

export function normalizeTaxId(value = '') {
  for (const candidate of numericCandidates(value)) {
    if (candidate.length === 14) return `${candidate.slice(0, 4)}-${candidate.slice(4, 10)}-${candidate.slice(10, 13)}-${candidate.slice(13)}`
    if (candidate.length === 9) return `${candidate.slice(0, 8)}-${candidate.slice(8)}`
  }
  return ''
}

export function normalizeNrc(value = '') {
  const text = String(value || '').toUpperCase()
  const candidates = text.match(/[0-9OQDILSZGBT]{3,7}\s*[-–_/]\s*[0-9OQDILSZGBT]/g) || []
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate)
    if (digits.length >= 4 && digits.length <= 8) return `${digits.slice(0, -1)}-${digits.slice(-1)}`
  }
  return ''
}

export function normalizeContributorName(value = '') {
  const lines = textLines(value)
    .map((line) => line
      .replace(/NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE/gi, '')
      .replace(/RAZ[ÓO]N\s+SOCIAL/gi, '')
      .replace(/^[:.\-–\s]+/, '')
      .trim())
    .filter(Boolean)

  const candidates = []
  for (let i = 0; i < lines.length; i += 1) {
    const one = cleanHumanText(lines[i])
    if (isContributorName(one)) candidates.push(one)
    if (i + 1 < lines.length) {
      const two = cleanHumanText(`${lines[i]} ${lines[i + 1]}`)
      if (isContributorName(two)) candidates.push(two)
    }
  }
  return candidates.sort((a, b) => scoreName(b) - scoreName(a))[0] || ''
}

export function parseActivities(value = '') {
  const lines = textLines(value)
    .map((line) => line
      .replace(/GIRO\s+O\s+ACTIVIDAD\s+ECON[ÓO]MICA/gi, '')
      .replace(/^(PRIMARIA|SECUNDARIA|TERCIARIA)\s*[:.\-–]?\s*/i, '')
      .trim())
    .filter(Boolean)

  const found = []
  for (const line of lines) {
    const clean = cleanHumanText(line)
    if (!clean || clean.length < 5 || isFiscalLabel(clean) || looksLikeAddress(clean) || /^\d[\d\s.,\-_/]*$/.test(clean)) continue
    const matched = matchActivity(clean)
    const item = { code: matched?.code || '', name: matched?.name || clean }
    const key = item.code || normalizeWords(item.name)
    if (!found.some((existing) => (existing.code || normalizeWords(existing.name)) === key)) found.push(item)
    if (found.length === 3) break
  }
  return found
}

export function normalizeAddress(value = '') {
  const lines = textLines(value)
    .map((line) => line
      .replace(/DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ/gi, '')
      .replace(/CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE.*$/gi, '')
      .trim())
    .filter(Boolean)

  const addressLines = []
  for (const line of lines) {
    if (/CATEGOR[IÍ]A|FIRMA|FUNCIONARIO|C[ÓO]DIGO\s+[ÚU]NICO|ESTA\s+TARJETA/i.test(line)) break
    if (looksLikeAddress(line) || addressLines.length) addressLines.push(line)
    if (addressLines.length >= 3) break
  }

  let address = cleanHumanText(addressLines.join(' '))
  address = address.replace(/(?:\s+[A-Z0-9]{1,2}){3,}\s*$/i, '').replace(/\s{2,}/g, ' ').trim()
  return looksLikeAddress(address) ? address : ''
}

export function mergeVatReadings(first = {}, second = {}) {
  const merged = {}
  for (const field of FIELD_NAMES) {
    const a = String(first[field] || '').trim()
    const b = String(second[field] || '').trim()
    merged[field] = chooseBetterReading(field, a, b)
  }
  return merged
}

function chooseBetterReading(field, a, b) {
  if (!a) return b
  if (!b) return a
  return readingScore(field, b) > readingScore(field, a) ? b : a
}

function readingScore(field, value) {
  if (field === 'nit') return normalizeTaxId(value) ? 100 : Math.min(value.length, 20)
  if (field === 'nrc') return normalizeNrc(value) ? 100 : Math.min(value.length, 20)
  if (field === 'name') {
    const name = normalizeContributorName(value)
    return name ? 100 + scoreName(name) : Math.min(value.length, 30)
  }
  if (field === 'activity') return parseActivities(value).length * 100 + Math.min(value.length, 90)
  if (field === 'address') return normalizeAddress(value) ? 100 + Math.min(value.length, 100) : Math.min(value.length, 40)
  return value.length
}

function confidenceFor(field, raw, normalized) {
  if (!normalized) return 0
  if (field === 'nit' || field === 'nrc') return 0.98
  if (field === 'name') return scoreName(normalized) >= 45 ? 0.94 : 0.75
  if (field === 'activity') return matchActivity(normalized) ? 0.95 : 0.76
  if (field === 'address') return normalized.length >= 20 && looksLikeAddress(normalized) ? 0.9 : 0.7
  return 0.8
}

function numericCandidates(value) {
  const text = String(value || '').toUpperCase()
  const groups = text.match(/[0-9OQDILSZGBT][0-9OQDILSZGBT\s.\-_/]{6,24}[0-9OQDILSZGBT]/g) || []
  return groups.map(normalizeDigits).filter((digits) => digits.length === 9 || digits.length === 14)
}

function normalizeDigits(value = '') {
  return String(value).toUpperCase()
    .replace(/[OQD]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/T/g, '7')
    .replace(/B/g, '8')
    .replace(/\D/g, '')
}

function textLines(value = '') {
  return String(value || '').replace(/\r/g, '\n').split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function cleanHumanText(value = '') {
  return String(value || '').replace(/^[^A-ZÁÉÍÓÚÑ0-9]+/i, '').replace(/[|]/g, 'I').replace(/[_—]{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function isContributorName(value = '') {
  const text = cleanHumanText(value)
  if (text.length < 8 || text.length > 100) return false
  if (/\d{3,}/.test(text) || isFiscalLabel(text) || looksLikeAddress(text)) return false
  if (/\b(VENTA|REPARACI[ÓO]N|SERVICIOS?|ACCESORIOS?|VEH[IÍ]CULOS?|AUTOMOTORES?|PARTES?|GIRO|ACTIVIDAD|MINISTERIO|HACIENDA|REGISTRO)\b/i.test(text)) return false
  const words = text.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  if (words.length < 2) return false
  const substantial = words.filter((word) => word.length >= 4).length
  const legal = /\b(S\.?A\.?|C\.?V\.?|LTDA|LIMITADA|SOCIEDAD|ASOCIACI[ÓO]N|FUNDACI[ÓO]N)\b/i.test(text)
  return legal || text.includes(',') || substantial >= 2
}

function scoreName(value = '') {
  const words = value.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  return words.length * 10 + (value.includes(',') ? 20 : 0) + Math.min(value.length, 50) / 5
}

function isFiscalLabel(value = '') {
  return /NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE|NIT|DUI|NRC|REGISTRO|GIRO|ACTIVIDAD\s+ECON[ÓO]MICA|DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ|CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE/i.test(value)
}

function looksLikeAddress(value = '') {
  return /\b(CALLE|AV(?:ENIDA)?|COL(?:ONIA)?|BARRIO|URB(?:ANIZACI[ÓO]N)?|PAS(?:AJE)?|CARRETERA|KM|POL[IÍ]GONO|LOTE|AHUACHAP[AÁ]N|SAN\s+SALVADOR|SANTA\s+ANA|SONSONATE|LA\s+LIBERTAD|DISTRITO|MUNICIPIO|DEPARTAMENTO)\b/i.test(value)
}

function normalizeWords(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchActivity(raw = '') {
  const target = normalizeWords(raw)
  if (!target || target.length < 4) return null
  const targetWords = new Set(target.split(' ').filter((word) => word.length > 3))
  let best = null
  let bestScore = 0
  for (const item of DTE_ACTIVITIES) {
    const candidate = normalizeWords(item.name)
    if (candidate.includes(target) || target.includes(candidate)) return item
    const score = candidate.split(' ').filter((word) => word.length > 3 && targetWords.has(word)).length
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= 2 ? best : null
}
