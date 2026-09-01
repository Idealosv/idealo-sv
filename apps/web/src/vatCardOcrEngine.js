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
      name: name ? 0.95 : 0,
      nit: nit ? 0.98 : 0,
      nrc: nrc ? 0.98 : 0,
      business_activity: primary?.code ? 0.96 : primary?.name ? 0.72 : 0,
      address: address ? 0.92 : 0,
    },
  }

  if (!name) result.missing.push('razón social')
  if (!nit) result.missing.push('NIT')
  if (!nrc) result.missing.push('NRC')
  if (!result.business_activity) result.missing.push('giro / actividad')
  if (!address) result.missing.push('dirección de casa matriz')
  if (primary?.name && !primary.code) result.review_fields.push('business_activity')

  result.ready_for_dte03 = result.missing.length === 0 && result.review_fields.length === 0
  return result
}

export function normalizeTaxId(value = '') {
  const raw = String(value || '').toUpperCase()
  const formatted = raw.match(/([0-9OQDILSZGBT]{4})\D{0,4}([0-9OQDILSZGBT]{6})\D{0,4}([0-9OQDILSZGBT]{3,4})\D{0,4}([0-9OQDILSZGBT])/)
  if (formatted) {
    const a = normalizeDigits(formatted[1])
    const b = normalizeDigits(formatted[2])
    const c = normalizeDigits(formatted[3]).slice(0, 3)
    const d = normalizeDigits(formatted[4])
    if (a.length === 4 && b.length === 6 && c.length === 3 && d.length === 1) return `${a}-${b}-${c}-${d}`
  }

  for (const digits of numericCandidates(raw)) {
    if (digits.length === 14) return `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
    if (digits.length === 9) return `${digits.slice(0, 8)}-${digits.slice(8)}`
  }
  return ''
}

export function normalizeNrc(value = '') {
  const raw = String(value || '').toUpperCase()
  const candidates = raw.match(/[0-9OQDILSZGBT]{4,7}\s*[-–_/]?\s*[0-9OQDILSZGBT]/g) || []
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate)
    if (digits.length >= 5 && digits.length <= 8) return `${digits.slice(0, -1)}-${digits.slice(-1)}`
  }
  return ''
}

export function normalizeContributorName(value = '') {
  const lines = textLines(value)
    .map((line) => cleanHumanText(line.replace(/NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE/gi, '').replace(/RAZ[ÓO]N\s+SOCIAL/gi, '')))
    .filter(Boolean)

  const candidates = []
  for (let i = 0; i < lines.length; i += 1) {
    for (const candidate of [lines[i], i + 1 < lines.length ? `${lines[i]} ${lines[i + 1]}` : '']) {
      const clean = cleanHumanText(candidate)
      if (isContributorName(clean)) candidates.push(clean)
    }
  }
  return candidates.sort((a, b) => scoreName(b) - scoreName(a))[0] || ''
}

export function parseActivities(value = '') {
  const lines = textLines(value)
    .map((line) => cleanHumanText(line
      .replace(/GIRO\s+O\s+ACTIVIDAD\s+ECON[ÓO]MICA/gi, '')
      .replace(/^(PRIMARIA|SECUNDARIA|TERCIARIA)\s*[:.\-–]?\s*/i, '')))
    .filter(Boolean)

  const found = []
  for (const line of lines) {
    if (!plausibleText(line, 5) || isFiscalLabel(line) || looksLikeAddress(line) || /^\d[\d\s.,\-_/]*$/.test(line)) continue
    const matched = matchActivity(line)
    if (!matched && noiseRatio(line) > 0.05) continue
    const item = matched ? { code: matched.code, name: matched.name } : { code: '', name: line }
    const key = item.code || normalizeWords(item.name)
    if (!found.some((existing) => (existing.code || normalizeWords(existing.name)) === key)) found.push(item)
    if (found.length === 3) break
  }
  return found
}

export function normalizeAddress(value = '') {
  const lines = textLines(value)
    .map((line) => cleanHumanText(line.replace(/DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ/gi, '').replace(/CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE.*$/gi, '')))
    .filter(Boolean)

  const selected = []
  for (const line of lines) {
    if (/CATEGOR[IÍ]A|FIRMA|FUNCIONARIO|C[ÓO]DIGO\s+[ÚU]NICO|ESTA\s+TARJETA/i.test(line)) break
    if (looksLikeAddress(line) || selected.length) selected.push(line)
    if (selected.length >= 3) break
  }
  const address = cleanHumanText(selected.join(' ')).replace(/\s{2,}/g, ' ').trim()
  if (!looksLikeAddress(address) || !plausibleText(address, 12) || noiseRatio(address) > 0.08 || !addressStructureQuality(address)) return ''
  return address
}

export function mergeVatReadings(first = {}, second = {}) {
  const merged = {}
  for (const field of FIELD_NAMES) merged[field] = chooseBetterReading(field, first[field], second[field])
  return merged
}

function chooseBetterReading(field, a = '', b = '') {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left) return right
  if (!right) return left
  return readingScore(field, right) > readingScore(field, left) ? right : left
}

function readingScore(field, value) {
  if (field === 'nit') return normalizeTaxId(value) ? 1000 : plausibleText(value, 5) ? 5 : 0
  if (field === 'nrc') return normalizeNrc(value) ? 1000 : plausibleText(value, 4) ? 5 : 0
  if (field === 'name') return normalizeContributorName(value) ? 1000 + scoreName(normalizeContributorName(value)) : 0
  if (field === 'activity') return parseActivities(value).filter((item) => item.code).length * 1000 + parseActivities(value).length * 100
  if (field === 'address') return normalizeAddress(value) ? 1000 + normalizeAddress(value).length : 0
  return 0
}

function numericCandidates(value) {
  const groups = String(value || '').toUpperCase().match(/[0-9OQDILSZGBT][0-9OQDILSZGBT\s.\-_/]{6,24}[0-9OQDILSZGBT]/g) || []
  return groups.map(normalizeDigits).filter((digits) => digits.length === 9 || digits.length === 14)
}

function normalizeDigits(value = '') {
  return String(value).toUpperCase()
    .replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/Z/g, '2').replace(/S/g, '5')
    .replace(/G/g, '6').replace(/T/g, '7').replace(/B/g, '8').replace(/\D/g, '')
}

function textLines(value = '') {
  return String(value || '').replace(/\r/g, '\n').split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function cleanHumanText(value = '') {
  return String(value || '').replace(/^[^A-ZÁÉÍÓÚÑ0-9]+/i, '').replace(/[|]/g, 'I').replace(/[_—]{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function plausibleText(value, minLength) {
  const text = String(value || '').trim()
  if (text.length < minLength) return false
  const letters = (text.match(/[A-ZÁÉÍÓÚÑ]/gi) || []).length
  return letters / Math.max(1, text.length) >= 0.58 && noiseRatio(text) <= 0.12
}

function noiseRatio(value = '') {
  const text = String(value || '')
  const noise = (text.match(/[^A-ZÁÉÍÓÚÑ0-9 ,.#°º/'()\-]/gi) || []).length
  return noise / Math.max(1, text.length)
}

function addressStructureQuality(value = '') {
  const text = String(value || '').toUpperCase()
  const signals = [
    /\bCALLE\b/, /\bAV(?:ENIDA)?\b/, /\bCOL(?:ONIA)?\b/, /\bBARRIO\b/, /\bURB(?:ANIZACI[ÓO]N)?\b/,
    /\bPAS(?:AJE)?\b/, /\bCARRETERA\b/, /\bLOTE\b/, /\bDISTRITO\b/, /\bMUNICIPIO\b/, /\bDEPARTAMENTO\b/,
    /\bAHUACHAP[AÁ]N\b/, /\bSAN\s+SALVADOR\b/, /\bSANTA\s+ANA\b/, /\bSONSONATE\b/, /\bLA\s+LIBERTAD\b/,
  ]
  const signalCount = signals.filter((pattern) => pattern.test(text)).length
  if (signalCount < 2) return false

  const words = text.match(/[A-ZÁÉÍÓÚÑ]{1,}/g) || []
  if (words.length < 4) return false
  const short = words.filter((word) => word.length <= 2 && !['DE', 'LA', 'EL', 'AL'].includes(word)).length
  if (short / words.length > 0.22) return false

  const substantial = words.filter((word) => word.length >= 3).length
  return substantial / words.length >= 0.68
}

function isContributorName(value = '') {
  const text = cleanHumanText(value)
  if (!plausibleText(text, 8) || text.length > 100) return false
  if (/\d{3,}/.test(text) || isFiscalLabel(text) || looksLikeAddress(text)) return false
  if (/\b(VENTA|REPARACI[ÓO]N|SERVICIOS?|ACCESORIOS?|VEH[IÍ]CULOS?|AUTOMOTORES?|PARTES?|GIRO|ACTIVIDAD|MINISTERIO|HACIENDA|REGISTRO|CONTRIBUYENTES?)\b/i.test(text)) return false
  const words = text.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  if (words.length < 2) return false
  const substantial = words.filter((word) => word.length >= 4).length
  const legal = /\b(S\.?A\.?|C\.?V\.?|LTDA|LIMITADA|SOCIEDAD|ASOCIACI[ÓO]N|FUNDACI[ÓO]N)\b/i.test(text)
  return legal || text.includes(',') || substantial >= 3
}

function scoreName(value = '') {
  const words = value.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  return words.length * 10 + (value.includes(',') ? 25 : 0) + Math.min(value.length, 60) / 4
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
  const words = new Set(target.split(' ').filter((word) => word.length > 3))
  let best = null
  let bestScore = 0
  for (const item of DTE_ACTIVITIES) {
    const candidate = normalizeWords(item.name)
    if (candidate.includes(target) || target.includes(candidate)) return item
    const score = candidate.split(' ').filter((word) => word.length > 3 && words.has(word)).length
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= 3 ? best : null
}
