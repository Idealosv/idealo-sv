import { DTE_ACTIVITIES } from './dteCatalogs'

const INSTITUTIONAL = [
  /MINISTERIO\s+DE\s+HACIENDA/i,
  /DIRECCI[ÓO]N\s+GENERAL\s+DE\s+IMPUESTOS\s+INTERNOS/i,
  /REGISTRO\s+DE\s+CONTRIBUYENTES/i,
  /FIRMA\s+DEL\s+FUNCIONARIO/i,
  /CATEGOR[IÍ]A\s+DE\s+CONTRIBUYENTE/i,
  /ESTA\s+TARJETA\s+ACREDITA/i,
  /PARA\s+TODA\s+GESTI[ÓO]N/i,
  /FECHA\s+DE\s+EXPEDICI[ÓO]N/i,
  /C[ÓO]DIGO\s+[ÚU]NICO/i,
]

const ADDRESS_HINT = /\b(CALLE|AV(?:ENIDA)?|BOULEVARD|BLVD|COL(?:ONIA)?|URB(?:ANIZACI[ÓO]N)?|BARRIO|POL[IÍ]GONO|KM|CARRETERA|PAS(?:AJE)?|RESIDENCIAL|LOT(?:E)?|CASA|FINAL|CONTIGUO|CTGO|DISTRITO|MUNICIPIO|DEPARTAMENTO|SAN\s+SALVADOR|SANTA\s+ANA|AHUACHAP[AÁ]N|SONSONATE|LA\s+LIBERTAD)\b/i
const NIT_LABEL = /(?:NIT(?:\s*\/\s*DUI)?|DUI(?:\s*\/\s*NIT)?|IDENTIFICACI[ÓO]N\s+TRIBUTARIA|NO\.?\s*(?:DE\s*)?IDENTIFICACI[ÓO]N\s+TRIBUTARIA)/i
const NRC_LABEL = /(?:NRC|N[°ºO.]?\s*(?:DE\s*)?REGISTRO(?:\s*\(?NRC\)?)?|REGISTRO\s+(?:DE\s+)?IVA)/i
const NAME_LABEL = /(?:NOMBRE\s+(?:DEL\s+)?CONTRIBUYENTE|NOMBRE\s*\/\s*RAZ[ÓO]N\s+SOCIAL|NOMBRE\s+O\s+RAZ[ÓO]N\s+SOCIAL|RAZ[ÓO]N\s+SOCIAL|DENOMINACI[ÓO]N)/i
const ACTIVITY_LABEL = /(?:GIRO\s+O\s+ACTIVIDAD\s+ECON[ÓO]MICA|GIRO\s*\/\s*ACTIVIDAD|GIRO|ACTIVIDAD\s+ECON[ÓO]MICA)/i
const STOP_ADDRESS = /CATEGOR[IÍ]A|FIRMA|FUNCIONARIO|ESTA\s+TARJETA|C[ÓO]DIGO\s+[ÚU]NICO|REGISTRO\s+DE\s+CONTRIBUYENTES/i
const COMMERCIAL_NAME_NOISE = /\b(VENTA|REPARACI[ÓO]N|SERVICIOS?|ACCESORIOS?|VEH[IÍ]CULOS?|AUTOMOTORES?|ACTIVIDAD|GIRO|REPUESTOS?|PARTES?)\b/i

export function parseVatCardSides(frontText = '', backText = '') {
  const front = linesOf(frontText)
  const back = linesOf(backText)
  const all = [...front, ...back]
  const compact = all.join('\n')

  const nit = findNit(front, compact)
  const nrc = findNrc(front, compact, nit)
  const name = findName(front)
  const activityRaw = findActivity(front)
  const address = findAddress(back)
  const activity = matchActivity(activityRaw)

  const missing = []
  if (!nit) missing.push('NIT')
  if (!nrc) missing.push('NRC')
  if (!name) missing.push('razón social')
  if (!activityRaw) missing.push('giro / actividad')
  if (!address) missing.push('dirección de casa matriz')

  const review_fields = []
  if (name && suspiciousName(name)) review_fields.push('name')
  if (address && suspiciousAddress(address)) review_fields.push('address')

  return {
    name,
    nit,
    nrc,
    business_activity: activity?.name || activityRaw,
    activity_code: activity?.code || '',
    address,
    missing,
    review_fields,
    ready_for_dte03: missing.length === 0 && review_fields.length === 0,
  }
}

export function extractVatNit(text = '') {
  const lines = linesOf(text)
  return findNit(lines, lines.join('\n'))
}

function linesOf(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[|]/g, 'I')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function isInstitutional(value = '') { return INSTITUTIONAL.some((pattern) => pattern.test(value)) }

function findNit(lines, compact) {
  const labelIndex = lines.findIndex((line) => NIT_LABEL.test(line))
  const preferred = []
  if (labelIndex >= 0) preferred.push(lines.slice(Math.max(0, labelIndex - 1), labelIndex + 4).join(' '))
  preferred.push(compact)

  for (const source of preferred) {
    const traditional = String(source || '').match(/(?:[0-9OQDILSB]{3,4}[\s.\-_/]*){3,5}[0-9OQDILSB]{1,4}/gi) || []
    for (const candidate of traditional) {
      const digits = normalizeOcrDigits(candidate)
      if (digits.length === 14) return `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
    }

    const duiCandidates = String(source || '').match(/[0-9OQDILSB]{8}[\s.\-_/]*[0-9OQDILSB]/gi) || []
    for (const candidate of duiCandidates) {
      const digits = normalizeOcrDigits(candidate)
      if (digits.length === 9) return `${digits.slice(0, 8)}-${digits.slice(8)}`
    }
  }
  return ''
}

function normalizeOcrDigits(value = '') {
  return String(value).toUpperCase().replace(/O|Q|D/g, '0').replace(/I|L/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/\D/g, '')
}

function findNrc(lines, compact, nit) {
  const labelIndex = lines.findIndex((line) => NRC_LABEL.test(line))
  const sources = []
  if (labelIndex >= 0) sources.push(lines.slice(Math.max(0, labelIndex - 1), labelIndex + 3).join(' '))
  sources.push(findField(lines, NRC_LABEL, { maxNext: 2 }))
  sources.push(compact)

  for (const source of sources) {
    const matches = String(source || '').match(/\b[0-9OQDILSB]{2,7}[\s.\-_/]+[0-9OQDILSB]\b/gi) || []
    for (const match of matches) {
      const digits = normalizeOcrDigits(match)
      if (digits.length < 3 || digits.length > 8) continue
      const normalized = `${digits.slice(0, -1)}-${digits.slice(-1)}`
      if (nit && normalizeOcrDigits(nit).includes(digits)) continue
      return normalized
    }
  }
  return ''
}

function findName(lines) {
  const direct = cleanName(findField(lines, NAME_LABEL, { maxNext: 3, reject: (value) => isInstitutional(value) || !looksLikeName(value) }))
  if (direct && looksLikeName(direct) && !suspiciousName(direct)) return direct

  const taxIndex = lines.findIndex((line) => NIT_LABEL.test(line) || NRC_LABEL.test(line))
  const end = taxIndex >= 0 ? taxIndex : Math.min(lines.length, 12)
  const start = Math.max(0, end - 7)
  const candidates = lines.slice(start, end)
    .map(cleanName)
    .filter((value) => looksLikeName(value) && !isInstitutional(value) && !isLabel(value) && !ADDRESS_HINT.test(value))

  return candidates.sort((a, b) => nameScore(b) - nameScore(a))[0] || direct || ''
}

function looksLikeName(value = '') {
  const text = cleanName(value)
  if (text.length < 7 || text.length > 110) return false
  if (/\d{3,}/.test(text) || ACTIVITY_LABEL.test(text) || NIT_LABEL.test(text) || NRC_LABEL.test(text)) return false
  const words = text.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  return words.length >= 2
}

function suspiciousName(value = '') {
  const text = cleanName(value)
  const words = text.split(/\s+/).filter(Boolean)
  if (/[_—]{2,}/.test(text)) return true
  if (/:/.test(text) && COMMERCIAL_NAME_NOISE.test(text)) return true
  if (words.length >= 8 && COMMERCIAL_NAME_NOISE.test(text)) return true
  if (/(?:\s+[A-ZÁÉÍÓÚÑ0-9]{1,2}){3,}\s*$/i.test(text)) return true
  return false
}

function nameScore(value = '') {
  const words = value.match(/[A-ZÁÉÍÓÚÑ]{2,}/gi) || []
  const suspiciousPenalty = suspiciousName(value) ? 45 : 0
  const commercialPenalty = COMMERCIAL_NAME_NOISE.test(value) && words.length >= 6 ? 30 : 0
  return words.length * 10 + (value.includes(',') ? 18 : 0) + Math.min(value.length, 50) / 10 - suspiciousPenalty - commercialPenalty
}

function findActivity(lines) {
  const direct = findField(lines, ACTIVITY_LABEL, { maxNext: 4, reject: (value) => isInstitutional(value) || /^\d[\d\s.-]*$/.test(value), allowActivityValue: true })
  if (direct) return cleanActivity(direct)
  const hintIndex = lines.findIndex((line) => /GIRO|ACTIVIDAD|ECON[ÓO]MIC/i.test(line))
  if (hintIndex >= 0) {
    for (let offset = 1; offset <= 5; offset += 1) {
      const candidate = clean(lines[hintIndex + offset] || '')
      if (!candidate || isInstitutional(candidate) || isHardLabel(candidate) || NRC_LABEL.test(candidate) || NIT_LABEL.test(candidate) || /^\d[\d\s.-]*$/.test(candidate)) continue
      if (candidate.length >= 5) return cleanActivity(candidate)
    }
  }
  return ''
}

function findField(lines, label, { maxNext = 2, reject = () => false, allowActivityValue = false } = {}) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue
    const inline = clean(lines[index].replace(label, '').replace(/^\s*[:.\-–()]+\s*/, ''))
    if (inline.length > 2 && !reject(inline) && !isLabel(inline)) return inline
    for (let offset = 1; offset <= maxNext; offset += 1) {
      const candidate = clean(lines[index + offset] || '')
      if (!candidate || reject(candidate)) continue
      if (allowActivityValue ? isHardLabel(candidate) : isLabel(candidate)) continue
      return candidate
    }
  }
  return ''
}

function findAddress(backLines) {
  const matrixIndex = backLines.findIndex((line) => /DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ/i.test(line))
  if (matrixIndex >= 0) {
    const inline = cleanAddress(backLines[matrixIndex].replace(/DIRECCI[ÓO]N\s+(?:DE\s+)?CASA\s+MATRIZ/i, ''))
    if (validAddress(inline)) return inline
    const collected = []
    for (let i = matrixIndex + 1; i < Math.min(backLines.length, matrixIndex + 7); i += 1) {
      const candidate = cleanAddress(backLines[i])
      if (!candidate || isInstitutional(candidate)) continue
      if (STOP_ADDRESS.test(candidate)) break
      collected.push(candidate)
    }
    const joined = cleanAddress(collected.join(' '))
    if (validAddress(joined)) return joined
  }

  const firstAddress = backLines.findIndex((line) => validAddress(cleanAddress(line)))
  if (firstAddress >= 0) {
    const collected = []
    for (let i = firstAddress; i < Math.min(backLines.length, firstAddress + 4); i += 1) {
      const candidate = cleanAddress(backLines[i])
      if (!candidate || isInstitutional(candidate) || STOP_ADDRESS.test(candidate)) break
      collected.push(candidate)
    }
    const joined = cleanAddress(collected.join(' '))
    if (validAddress(joined)) return joined
  }
  return ''
}

function stripShortOcrTail(value = '') {
  const tokens = String(value).trim().split(/\s+/)
  let cut = tokens.length
  let shortRun = 0
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i].replace(/[^A-ZÁÉÍÓÚÑ0-9]/gi, '')
    if (!token) { cut = i; continue }
    if (token.length <= 2) {
      shortRun += 1
      cut = i
      continue
    }
    break
  }
  return shortRun >= 3 ? tokens.slice(0, cut).join(' ') : value
}

function cleanAddress(value = '') {
  const base = clean(value)
    .split(STOP_ADDRESS)[0]
    .replace(/\s+(?:LE|LA|EL)\s+[A-Z]{1,2}\s+[A-Z]{1,3}$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return stripShortOcrTail(base).replace(/[|_—-]+\s*$/g, '').trim()
}

function suspiciousAddress(value = '') {
  const text = clean(value)
  if (/[_—]{2,}/.test(text)) return true
  if (/(?:\s+[A-ZÁÉÍÓÚÑ0-9]{1,2}){3,}\s*$/i.test(text)) return true
  if (/\b(?:LE|AN|RQ|QO|OI)\b/i.test(text) && text.split(/\s+/).length > 8) return true
  return false
}

function validAddress(value = '') { return value.length >= 8 && ADDRESS_HINT.test(value) && !isInstitutional(value) }
function isHardLabel(value = '') { return /^(NIT|DUI|NRC|NOMBRE|RAZ[ÓO]N|DENOMINACI[ÓO]N|DIRECCI[ÓO]N|FECHA|C[ÓO]DIGO|N[°ºO.]?\s*(?:DE\s*)?REGISTRO)\b/i.test(value) }
function isLabel(value = '') { if (isHardLabel(value)) return true; return /^(GIRO\b|ACTIVIDAD\s+ECON[ÓO]MICA\b)/i.test(value) }
function clean(value = '') { return String(value).replace(/^[^A-ZÁÉÍÓÚÑ0-9]+/i, '').replace(/\s{2,}/g, ' ').trim() }
function cleanName(value = '') { return clean(value).replace(/^(?:[EÉ]S|E5|IS|I5)\s+(?=[A-ZÁÉÍÓÚÑ]{3,})/i, '').replace(/\s+[I1L|]$/i, '').replace(/\s{2,}/g, ' ').trim() }
function cleanActivity(value = '') { return clean(value).replace(/\s+[I1L|]$/i, '').replace(/\s{2,}/g, ' ').trim() }
function normalize(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() }

function matchActivity(raw = '') {
  const target = normalize(raw)
  if (!target || target.length < 4) return null
  const targetWords = new Set(target.split(' ').filter((word) => word.length > 3))
  let best = null
  let bestScore = 0
  DTE_ACTIVITIES.forEach((item) => {
    const candidate = normalize(item.name)
    if (candidate.includes(target) || target.includes(candidate)) { best = item; bestScore = 100; return }
    const score = candidate.split(' ').filter((word) => word.length > 3).reduce((sum, word) => sum + (targetWords.has(word) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; best = item }
  })
  return bestScore >= 2 ? best : null
}
