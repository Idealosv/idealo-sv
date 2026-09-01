import { DTE_ACTIVITIES } from './dteCatalogs'

const FIELD_NAMES = ['name', 'nit', 'nrc', 'activity', 'address']
const STOP_AFTER_NAME = /IDENTIFICACI[ÓO]N\s+TRIBUTARIA|\bNIT\b|\bNRC\b|N[°º]?\s*DE\s*REGISTRO|GIRO\s+O\s+ACTIVIDAD/i
const STOP_AFTER_ACTIVITY = /FECHA\s+DE\s+EXPEDICI[ÓO]N|C[ÓO]DIGO\s+[ÚU]NICO|\bRF\d|N[°º]\s*\d/i
const STOP_AFTER_ADDRESS = /CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE|FIRMA|FUNCIONARIO|C[ÓO]DIGO\s+[ÚU]NICO|ESTA\s+TARJETA/i

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
      name: name ? 0.97 : 0,
      nit: nit ? 0.99 : 0,
      nrc: nrc ? 0.99 : 0,
      business_activity: primary?.code ? 0.97 : 0,
      address: address ? 0.95 : 0,
    },
  }

  if (!name) result.missing.push('razón social')
  if (!nit) result.missing.push('NIT')
  if (!nrc) result.missing.push('NRC')
  if (!result.business_activity) result.missing.push('giro / actividad')
  if (!address) result.missing.push('dirección de casa matriz')

  result.ready_for_dte03 = result.missing.length === 0
  return result
}

export function normalizeTaxId(value = '') {
  const raw = String(value || '').toUpperCase()
  const formatted = raw.match(/([0-9OQDILSZGBT]{4})\D{0,5}([0-9OQDILSZGBT]{6})\D{0,5}([0-9OQDILSZGBT]{3,4})\D{0,5}([0-9OQDILSZGBT])/)
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
  const digitsOnly = normalizeDigits(raw)
  if (/^\d{5,8}$/.test(digitsOnly)) return `${digitsOnly.slice(0, -1)}-${digitsOnly.slice(-1)}`
  const candidates = raw.match(/[0-9OQDILSZGBT]{4,7}\s*[-–_/]?\s*[0-9OQDILSZGBT]/g) || []
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate)
    if (digits.length >= 5 && digits.length <= 8) return `${digits.slice(0, -1)}-${digits.slice(-1)}`
  }
  return ''
}

export function normalizeContributorName(value = '') {
  const lines = textLines(value)
  const anchored = extractNameAfterLabel(lines)
  if (anchored) return anchored

  // Sin una etiqueta reconocible, solo se acepta una señal fuerte. Esto evita convertir
  // una frase OCR aleatoria como “Eros couza...” en nombre del contribuyente.
  const candidates = []
  for (const line of lines) {
    const clean = cleanupName(line)
    if (!isContributorName(clean, { strictFallback: true })) continue
    candidates.push(clean)
  }
  return candidates.sort((a, b) => scoreName(b) - scoreName(a))[0] || ''
}

function extractNameAfterLabel(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const label = line.match(/NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE|RAZ[ÓO]N\s+SOCIAL/i)
    if (!label) continue
    const tail = cleanupName(line.slice((label.index || 0) + label[0].length))
    if (isContributorName(tail, { anchored: true })) return tail

    const collected = []
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      if (STOP_AFTER_NAME.test(lines[j])) break
      const candidate = cleanupName(lines[j])
      if (!candidate) continue
      collected.push(candidate)
      const joined = cleanupName(collected.join(' '))
      if (isContributorName(joined, { anchored: true })) return joined
    }
  }
  return ''
}

export function parseActivities(value = '') {
  const lines = textLines(value)
  const sections = extractActivitySections(lines)
  const found = []

  for (const text of sections) addMatchedActivity(found, text)

  // Respaldo: en tarjetas desgastadas la palabra PRIMARIA/SECUNDARIA puede perderse,
  // pero la descripción de CAT-019 suele seguir legible. Solo se acepta si hay match de catálogo.
  if (found.length < 2) {
    for (const line of lines) {
      if (STOP_AFTER_ACTIVITY.test(line)) break
      if (isFiscalLabel(line) || looksLikeAddress(line)) continue
      addMatchedActivity(found, line)
      if (found.length === 3) break
    }
  }

  return found.slice(0, 3)
}

function extractActivitySections(lines) {
  const sections = []
  let current = ''
  let active = false
  for (const rawLine of lines) {
    if (STOP_AFTER_ACTIVITY.test(rawLine)) break
    const line = cleanHumanText(rawLine.replace(/GIRO\s+[O0]\s+ACTIVIDAD\s+ECON[ÓO]MICA/gi, ''))
    const marker = line.match(/(?:^|\s)(P?RIMARIA|S?ECUNDARIA|T?ERCIARIA)\s*[:.\-–]?\s*/i)
    if (marker) {
      if (current) sections.push(current)
      active = true
      current = cleanHumanText(line.slice((marker.index || 0) + marker[0].length))
      continue
    }
    if (active && line && !isFiscalLabel(line)) current = cleanHumanText(`${current} ${line}`)
  }
  if (current) sections.push(current)
  return sections.filter(Boolean)
}

function addMatchedActivity(found, raw) {
  const clean = cleanActivityText(raw)
  if (!clean || !plausibleText(clean, 8) || looksLikeAddress(clean)) return
  const matched = matchActivity(clean)
  if (!matched) return
  if (!found.some((item) => item.code === matched.code)) found.push({ code: matched.code, name: matched.name })
}

export function normalizeAddress(value = '') {
  const lines = textLines(value)
  const anchored = extractAddressAfterLabel(lines)
  if (anchored) return anchored

  const candidates = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!looksLikeAddress(lines[i])) continue
    candidates.push(lines[i])
    if (i + 1 < lines.length && !STOP_AFTER_ADDRESS.test(lines[i + 1])) candidates.push(lines[i + 1])
    break
  }
  return validateAddress(cleanHumanText(candidates.join(' ')))
}

function extractAddressAfterLabel(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const label = line.match(/DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ/i)
    if (!label) continue
    const selected = []
    const tail = cleanHumanText(line.slice((label.index || 0) + label[0].length))
    if (tail) selected.push(tail)
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      if (STOP_AFTER_ADDRESS.test(lines[j])) break
      selected.push(cleanHumanText(lines[j]))
    }
    const address = validateAddress(cleanHumanText(selected.filter(Boolean).join(' ')))
    if (address) return address
  }
  return ''
}

function validateAddress(address) {
  if (!address || !looksLikeAddress(address) || !plausibleText(address, 12)) return ''
  if (noiseRatio(address) > 0.07 || !addressStructureQuality(address)) return ''
  return stripTrailingNoise(address)
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
  if (field === 'nit') return normalizeTaxId(value) ? 10000 : 0
  if (field === 'nrc') return normalizeNrc(value) ? 10000 : 0
  if (field === 'name') {
    const name = normalizeContributorName(value)
    return name ? 10000 + scoreName(name) : 0
  }
  if (field === 'activity') return parseActivities(value).length * 10000
  if (field === 'address') {
    const address = normalizeAddress(value)
    return address ? 10000 + address.length : 0
  }
  return 0
}

function numericCandidates(value) {
  const text = String(value || '').toUpperCase()
  const groups = text.match(/[0-9OQDILSZGBT][0-9OQDILSZGBT\s.\-_/]{6,24}[0-9OQDILSZGBT]/g) || []
  const direct = normalizeDigits(text)
  const all = groups.map(normalizeDigits)
  if (direct.length === 9 || direct.length === 14) all.push(direct)
  return [...new Set(all)].filter((digits) => digits.length === 9 || digits.length === 14)
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
  return String(value || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function cleanupName(value = '') {
  let text = cleanHumanText(value)
  text = text.replace(/\s+[,.;:\-]?\s*[A-ZÁÉÍÓÚÑ]{1,2}\s*$/i, (tail) => {
    const token = tail.replace(/[^A-ZÁÉÍÓÚÑ]/gi, '')
    return token.length <= 1 ? '' : tail
  }).trim()
  return text
}

function cleanActivityText(value = '') {
  return cleanHumanText(String(value || '')
    .replace(/GIRO\s+[O0]\s+ACTIVIDAD\s+ECON[ÓO]MICA/gi, '')
    .replace(/(?:^|\s)(P?RIMARIA|S?ECUNDARIA|T?ERCIARIA)\s*[:.\-–]?\s*/gi, ' '))
}

function cleanHumanText(value = '') {
  return String(value || '')
    .replace(/[|]/g, ' ')
    .replace(/[_—]{2,}/g, ' ')
    .replace(/^[^A-ZÁÉÍÓÚÑ0-9]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function stripTrailingNoise(value = '') {
  const words = cleanHumanText(value).split(/\s+/)
  while (words.length > 4 && /^[A-Z0-9]{1,2}$/i.test(words[words.length - 1])) words.pop()
  return words.join(' ').replace(/\s{2,}/g, ' ').trim()
}

function plausibleText(value, minLength) {
  const text = String(value || '').trim()
  if (text.length < minLength) return false
  const letters = (text.match(/[A-ZÁÉÍÓÚÑ]/gi) || []).length
  const allowed = (text.match(/[A-ZÁÉÍÓÚÑ0-9 ,.#°º/'():\-]/gi) || []).length
  return letters / Math.max(1, text.length) >= 0.58 && allowed / Math.max(1, text.length) >= 0.94
}

function noiseRatio(value = '') {
  const text = String(value || '')
  const noise = (text.match(/[^A-ZÁÉÍÓÚÑ0-9 ,.#°º/'():\-]/gi) || []).length
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

function isContributorName(value = '', options = {}) {
  const text = cleanupName(value)
  if (!plausibleText(text, 8) || text.length > 120) return false
  if (/\d{3,}/.test(text) || isFiscalLabel(text) || looksLikeAddress(text)) return false
  if (/\b(VENTA|REPARACI[ÓO]N|SERVICIOS?|ACCESORIOS?|VEH[IÍ]CULOS?|AUTOMOTORES?|PARTES?|GIRO|ACTIVIDAD|MINISTERIO|HACIENDA|REGISTRO|CONTRIBUYENTES?|IMPUESTOS?|INTERNOS?)\b/i.test(text)) return false
  const words = text.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  if (words.length < 2) return false
  const substantial = words.filter((word) => word.length >= 3).length
  if (substantial < 2) return false

  const legal = /\b(S\.?A\.?|C\.?V\.?|LTDA|LIMITADA|SOCIEDAD|ASOCIACI[ÓO]N|FUNDACI[ÓO]N)\b/i.test(text)
  if (options.anchored) return true
  if (legal || text.includes(',')) return true

  if (options.strictFallback) {
    const letters = text.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []
    const upper = text.match(/[A-ZÁÉÍÓÚÑ]/g) || []
    return letters.length > 0 && upper.length / letters.length >= 0.88 && substantial >= 3
  }
  return false
}

function scoreName(value = '') {
  const words = value.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  return words.length * 10 + (value.includes(',') ? 30 : 0) + Math.min(value.length, 70) / 4
}

function isFiscalLabel(value = '') {
  return /NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE|NIT|DUI|NRC|REGISTRO|GIRO|ACTIVIDAD\s+ECON[ÓO]MICA|DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ|CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE/i.test(value)
}

function looksLikeAddress(value = '') {
  return /\b(CALLE|AV(?:ENIDA)?|COL(?:ONIA)?|BARRIO|URB(?:ANIZACI[ÓO]N)?|PAS(?:AJE)?|CARRETERA|KM|POL[IÍ]GONO|LOTE|AHUACHAP[AÁ]N|SAN\s+SALVADOR|SANTA\s+ANA|SONSONATE|LA\s+LIBERTAD|DISTRITO|MUNICIPIO|DEPARTAMENTO)\b/i.test(value)
}

function normalizeWords(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchActivity(raw = '') {
  const target = normalizeWords(raw)
  if (!target || target.length < 4) return null
  const targetWords = new Set(target.split(' ').filter((word) => word.length > 3))
  let best = null
  let bestScore = 0
  let bestCoverage = 0
  for (const item of DTE_ACTIVITIES) {
    const candidate = normalizeWords(item.name)
    if (candidate.includes(target) || target.includes(candidate)) return item
    const candidateWords = candidate.split(' ').filter((word) => word.length > 3)
    const overlap = candidateWords.filter((word) => targetWords.has(word)).length
    const coverage = overlap / Math.max(1, Math.min(candidateWords.length, targetWords.size))
    if (overlap > bestScore || (overlap === bestScore && coverage > bestCoverage)) {
      bestScore = overlap
      bestCoverage = coverage
      best = item
    }
  }
  return bestScore >= 3 && bestCoverage >= 0.45 ? best : null
}
