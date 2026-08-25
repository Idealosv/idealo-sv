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
const NIT_LABEL = /(?:NIT(?:\s*\/\s*DUI)?|DUI(?:\s*\/\s*NIT)?|IDENTIFICACI[ÓO]N\s+TRIBUTARIA|NO\.?\s*DE\s*IDENTIFICACI[ÓO]N\s+TRIBUTARIA)/i
const ACTIVITY_LABEL = /(?:GIRO\s+O\s+ACTIVIDAD\s+ECON[ÓO]MICA|GIRO|ACTIVIDAD\s+ECON[ÓO]MICA)/i

export function parseVatCardSides(frontText = '', backText = '') {
  const front = linesOf(frontText)
  const back = linesOf(backText)
  const all = [...front, ...back]
  const compact = all.join('\n')

  const nit = findNit(front, compact)
  const nrc = findNrc(front, compact, nit)
  const name = cleanName(findField(front, /(?:NOMBRE\s+DEL\s+CONTRIBUYENTE|RAZ[ÓO]N\s+SOCIAL|DENOMINACI[ÓO]N)/i, { reject: isInstitutional }))
  const activityRaw = findActivity(front)
  const address = findAddress(back)
  const activity = matchActivity(activityRaw)

  const missing = []
  if (!nit) missing.push('NIT')
  if (!nrc) missing.push('NRC')
  if (!name) missing.push('razón social')
  if (!activityRaw) missing.push('giro / actividad')
  if (!address) missing.push('dirección de casa matriz')

  return { name, nit, nrc, business_activity: activity?.name || activityRaw, activity_code: activity?.code || '', address, missing, ready_for_dte03: missing.length === 0 }
}

export function extractVatNit(text = '') {
  const lines = linesOf(text)
  return findNit(lines, lines.join('\n'))
}

function linesOf(text) {
  return String(text || '').replace(/\r/g, '\n').replace(/[|]/g, 'I').split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function isInstitutional(value = '') { return INSTITUTIONAL.some((pattern) => pattern.test(value)) }

function findNit(lines, compact) {
  const labelIndex = lines.findIndex((line) => NIT_LABEL.test(line))
  const preferred = []
  if (labelIndex >= 0) preferred.push(lines.slice(labelIndex, labelIndex + 4).join(' '))
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
  const labeled = findField(lines, /(?:N[°ºO.]?\s*DE\s*REGISTRO|NRC|REGISTRO\s+(?:DE\s+)?IVA)/i, { maxNext: 2 })
  const sources = [labeled, compact]
  for (const source of sources) {
    const matches = String(source || '').match(/\b\d{2,7}[\s-]\d\b/g) || []
    for (const match of matches) {
      const normalized = match.replace(/\s+/g, '-')
      if (nit && nit.includes(normalized)) continue
      return normalized
    }
  }
  return ''
}

function findActivity(lines) {
  const direct = findField(lines, ACTIVITY_LABEL, { maxNext: 4, reject: (value) => isInstitutional(value) || /^\d[\d\s.-]*$/.test(value), allowActivityValue: true })
  if (direct) return cleanActivity(direct)
  const hintIndex = lines.findIndex((line) => /GIRO|ACTIVIDAD|ECON[ÓO]MIC/i.test(line))
  if (hintIndex >= 0) {
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = clean(lines[hintIndex + offset] || '')
      if (!candidate || isInstitutional(candidate) || isHardLabel(candidate) || /^\d[\d\s.-]*$/.test(candidate)) continue
      if (candidate.length >= 5) return cleanActivity(candidate)
    }
  }
  return ''
}

function findField(lines, label, { maxNext = 2, reject = () => false, allowActivityValue = false } = {}) {
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue
    const inline = clean(lines[index].replace(label, '').replace(/^\s*[:.\-–]+\s*/, ''))
    if (inline.length > 2 && !reject(inline)) return inline
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
  const matrixIndex = backLines.findIndex((line) => /DIRECCI[ÓO]N\s+DE\s+CASA\s+MATRIZ/i.test(line))
  if (matrixIndex >= 0) {
    const inline = clean(backLines[matrixIndex].replace(/DIRECCI[ÓO]N\s+DE\s+CASA\s+MATRIZ/i, ''))
    if (validAddress(inline)) return inline
    const collected = []
    for (let i = matrixIndex + 1; i < Math.min(backLines.length, matrixIndex + 6); i += 1) {
      const candidate = clean(backLines[i])
      if (!candidate || isInstitutional(candidate)) continue
      if (/CATEGOR[IÍ]A|FIRMA|FUNCIONARIO|ESTA\s+TARJETA|C[ÓO]DIGO\s+[ÚU]NICO/i.test(candidate)) break
      collected.push(candidate)
    }
    const joined = collected.join(' ').trim()
    if (validAddress(joined)) return joined
  }
  return ''
}

function validAddress(value = '') { return value.length >= 8 && ADDRESS_HINT.test(value) && !isInstitutional(value) }
function isHardLabel(value = '') { return /^(NIT|DUI|NRC|NOMBRE|RAZ[ÓO]N|DIRECCI[ÓO]N|FECHA|C[ÓO]DIGO|N[°ºO.]?\s*DE\s*REGISTRO)\b/i.test(value) }
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
