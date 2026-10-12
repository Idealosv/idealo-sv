import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { requireAuthenticatedUser, requireCompanyRole, DTE_ROLES } from './access-control.js'

const TYPES = Object.freeze({
  '04': { name: 'Nota de Remisión', file: 'DTE-NRE-v4.json', version: 4 },
  '05': { name: 'Nota de Crédito', file: 'DTE-NCE-v4.json', version: 4 },
  '06': { name: 'Nota de Débito', file: 'DTE-NDE-v4.json', version: 4 },
  '07': { name: 'Comprobante de Retención', file: 'DTE-CRE-v2.json', version: 2 },
  '08': { name: 'Comprobante de Liquidación', file: 'DTE-CLE-v2.json', version: 2 },
  '09': { name: 'Documento Contable de Liquidación', file: 'DTE-DCLE-v2.json', version: 2 },
  '11': { name: 'Factura de Exportación', file: 'DTE-FEXE-v3.json', version: 3 },
  '14': { name: 'Factura de Sujeto Excluido', file: 'DTE-FSEE-v2.json', version: 2 },
  '15': { name: 'Comprobante de Donación', file: 'DTE-CDE-v2.json', version: 2 },
})

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true })
addFormats(ajv)
const compiled = new Map()
function fail(message, code = 'DTE_CERTIFICATION_INVALID', statusCode = 400) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  throw error
}
const digits = v => String(v || '').replace(/\D/g, '')
const str = v => String(v ?? '').trim()

export function getCertificationTypes() {
  return Object.entries(TYPES).map(([type, value]) => ({ type, name: value.name, version: value.version }))
}
export function getCertificationSchema(type) {
  if (!Object.hasOwn(TYPES, type)) fail('Este tipo de documento no está habilitado en el editor de certificación.')
  const info = TYPES[type]
  if (!compiled.has(type)) {
    const schema = JSON.parse(readFileSync(new URL('./schemas/' + info.file, import.meta.url), 'utf8'))
    if (schema.properties?.identificacion?.properties?.tipoDte?.const !== type ||
        schema.properties?.identificacion?.properties?.version?.const !== info.version) {
      fail('El esquema técnico no coincide con el tipo/version seleccionado.', 'DTE_SCHEMA_MISMATCH', 500)
    }
    compiled.set(type, { schema, validate: ajv.compile(schema) })
  }
  return compiled.get(type)
}
function nullable(schema = {}) { return schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null')) }
export function sampleFromSchema(schema = {}, depth = 0) {
  if (depth > 9) return null
  if (Object.hasOwn(schema, 'const')) return schema.const
  if (schema.default !== undefined) return schema.default
  if (nullable(schema)) return null
  if (Array.isArray(schema.enum) && schema.enum.length === 1) return schema.enum[0]
  if (schema.properties || schema.type === 'object') {
    return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, spec]) => [key, sampleFromSchema(spec, depth + 1)]))
  }
  if (schema.type === 'array') {
    return (schema.minItems || 0) > 0 ? [sampleFromSchema(schema.items, depth + 1)] : []
  }
  if (schema.type === 'boolean') return false
  if (schema.type === 'number' || schema.type === 'integer') return 0
  return ''
}
function svNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]))
  return { date: [parts.year, parts.month, parts.day].join('-'), time: [parts.hour, parts.minute, parts.second].join(':') }
}
function issuerMapped(company, emisor = {}) {
  const map = {
    nit: digits(company.nit),
    nrc: digits(company.nrc),
    nombre: str(company.name),
    codActividad: str(company.activity_code),
    descActividad: str(company.business_activity),
    nombreComercial: str(company.trade_name) || null,
    telefono: digits(company.phone),
    correo: str(company.email).toLowerCase(),
    codEstable: 'M001',
    codPuntoVenta: 'P001',
  }
  for (const key of Object.keys(emisor)) if (Object.hasOwn(map, key)) emisor[key] = map[key]
  if (emisor.direccion && typeof emisor.direccion === 'object') {
    const dir = {
      departamento: str(company.department_code), municipio: str(company.municipality_code),
      distrito: str(company.district_code), complemento: str(company.address),
    }
    for (const key of Object.keys(emisor.direccion)) {
      if (Object.hasOwn(dir, key)) emisor.direccion[key] = dir[key]
    }
  }
  return emisor
}
export function prepareDteTestTemplate({ type, company, now = new Date() }) {
  const { schema } = getCertificationSchema(type)
  const body = sampleFromSchema(schema)
  const id = body.identificacion || {}
  const stamp = svNow(now)
  Object.assign(id, {
    version: TYPES[type].version, tipoDte: type, ambiente: '00',
    numeroControl: 'DTE-' + type + '-M001P001-000000000000000',
    codigoGeneracion: randomUUID().toUpperCase(),
    tipoModelo: 1, tipoOperacion: 1, tipoMoneda: 'USD',
  })
  if (Object.hasOwn(id, 'tipoContingencia')) id.tipoContingencia = null
  if (Object.hasOwn(id, 'motivoContin')) id.motivoContin = null
  if (Object.hasOwn(id, 'fecEmi')) id.fecEmi = stamp.date
  if (Object.hasOwn(id, 'horEmi')) id.horEmi = stamp.time
  body.emisor = issuerMapped(company, body.emisor || {})
  return body
}
function formatAjvErrors(errors) {
  return (errors || []).slice(0,12).map(e => {
    const path = e.instancePath?.replaceAll('/', '.') || '(raíz)'
    return path + ': ' + e.message
  }).join(' | ')
}
export function validateCertificationPayload(type, payload, company) {
  const { validate } = getCertificationSchema(type)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('El documento debe ser un objeto JSON.')
  if (payload.identificacion?.ambiente !== '00') fail('Solo se pueden preparar documentos del ambiente TEST 00.')
  if (payload.identificacion?.tipoDte !== type || payload.identificacion?.version !== TYPES[type].version)
    fail('Tipo y versión del documento no corresponden al esquema seleccionado.')
  if (payload.identificacion?.tipoModelo !== 1 || payload.identificacion?.tipoOperacion !== 1)
    fail('El editor permite únicamente emisión normal (modelo y operación 1), no contingencia.')
  if (!payload.emisor || digits(payload.emisor.nit) !== digits(company.nit) || !digits(company.nit))
    fail('El NIT del emisor debe ser el de la empresa activa del ERP.')
  if (!validate(payload)) fail('Documento no válido según el esquema MH: ' + formatAjvErrors(validate.errors), 'DTE_SCHEMA_VALIDATION')
  if (['05','06'].includes(type) && (!Array.isArray(payload.documentoRelacionado) || payload.documentoRelacionado.length < 1))
    fail('Las notas de crédito y débito necesitan el documento fiscal que modifican.')
  return true
}
async function companyForRequest({ request, supabase, companyId }) {
  const user = await requireAuthenticatedUser({ request, supabase })
  if (!companyId) fail('Se requiere seleccionar una empresa.')
  await requireCompanyRole({ supabase, userId: user.id, companyId, allowedRoles: DTE_ROLES.DRAFT, operation: 'preparar documentos de certificación MH TEST' })
  const { data: company, error } = await supabase.from('companies').select('*').eq('id',companyId).single()
  if (error) throw error
  if (!digits(company.nit)) fail('Completa el NIT de la empresa antes de generar DTE.')
  return { user, company }
}
export async function getCertificationEditor({ request, supabase }) {
  const companyId = str(request.query?.companyId), type = str(request.query?.type)
  const { company } = await companyForRequest({ request, supabase, companyId })
  return { type, name: TYPES[type]?.name, version: TYPES[type]?.version, document: prepareDteTestTemplate({ type, company }) }
}
export async function validateCertificationDraft({ request, supabase }) {
  const { companyId, dteType, document } = request.body || {}
  const type = str(dteType)
  const { company } = await companyForRequest({ request, supabase, companyId })
  validateCertificationPayload(type, document, company)
  return { valid: true, type, version: TYPES[type].version, environment: 'test', saved: false, transmitted: false }
}
export async function saveCertificationDraft({ request, supabase }) {
  const { companyId, dteType, document: submitted } = request.body || {}
  const type = str(dteType)
  const { user, company } = await companyForRequest({ request, supabase, companyId })
  if (!Object.hasOwn(TYPES, type)) fail('Tipo de DTE no habilitado.')
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) fail('Completa el JSON del documento.')
  if (JSON.stringify(submitted).length > 750000) fail('El documento excede el tamaño permitido.')
  if (submitted.identificacion?.ambiente !== '00' || submitted.identificacion?.tipoDte !== type)
    fail('El borrador seleccionado debe ser del tipo correcto en TEST.')
  if (digits(submitted.emisor?.nit) !== digits(company.nit)) fail('El emisor no corresponde a la empresa activa.')
  const { data: number, error: numberError } = await supabase.rpc('next_certification_dte_control_number', {
    p_company_id:companyId, p_dte_type:type,
  })
  if (numberError) throw numberError
  if (!number) fail('No se pudo reservar numeración DTE de pruebas.', 'DTE_SEQUENCE_FAILED', 500)
  // El ERP reserva la identidad fiscal una sola vez y jamás permite reutilizarla.
  const doc = structuredClone(submitted)
  const stamp = svNow()
  const id = doc.identificacion
  Object.assign(id, {
    ambiente:'00', tipoDte:type, version:TYPES[type].version, numeroControl:number,
    codigoGeneracion:randomUUID().toUpperCase(), fecEmi:stamp.date, horEmi:stamp.time,
    tipoModelo:1, tipoOperacion:1, tipoMoneda:'USD',
  })
  if (Object.hasOwn(id,'tipoContingencia')) id.tipoContingencia = null
  if (Object.hasOwn(id,'motivoContin')) id.motivoContin = null
  // Revalidar el cuerpo final, no confiar únicamente en un formulario de navegador.
  validateCertificationPayload(type,doc,company)
  const { data, error } = await supabase.from('dte_documents').insert({
    company_id:companyId, dte_type:type, environment:'test', status:'DRAFT',
    generation_code:id.codigoGeneracion, control_number:number, dte_payload:doc, created_by:user.id,
  }).select('id,control_number,generation_code,dte_type,environment,status').single()
  if (error) throw error
  return { ...data, schemaVersion:TYPES[type].version, signingRequired:true, transmitted:false }
}
