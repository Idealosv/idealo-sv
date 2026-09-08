import { buildFacturaElectronica } from './factura-electronica.js'
import { buildCreditoFiscal } from './credito-fiscal.js'

const ISSUER_FIELDS = [
  ['nit', 'NIT'], ['nrc', 'NRC'], ['name', 'razón social'],
  ['activity_code', 'código de actividad'], ['business_activity', 'actividad económica'],
  ['department_code', 'departamento'], ['municipality_code', 'municipio'],
  ['district_code', 'distrito'], ['address', 'dirección'], ['phone', 'teléfono'],
  ['email', 'correo'], ['establishment_code', 'código de establecimiento'],
  ['point_of_sale_code', 'código de punto de venta'],
]

const RECEIVER_FIELDS = [
  ['name', 'nombre'], ['document_type', 'tipo de documento'],
  ['document_number', 'número de documento'], ['activity_code', 'código de actividad'],
  ['business_activity', 'actividad económica'], ['department_code', 'departamento'],
  ['municipality_code', 'municipio'], ['district_code', 'distrito'],
  ['address', 'dirección'], ['phone', 'teléfono'], ['email', 'correo'],
]

const CCF_RECEIVER_FIELDS = [
  ['name', 'nombre o razón social'], ['tax_id', 'NIT'], ['nrc', 'NRC'],
  ['activity_code', 'código de actividad'], ['business_activity', 'actividad económica'],
  ['department_code', 'departamento'], ['municipality_code', 'municipio'],
  ['district_code', 'distrito'], ['address', 'dirección'], ['phone', 'teléfono'], ['email', 'correo'],
]

const digits = (value) => String(value || '').replace(/\D/g, '')
const text = (value) => String(value || '').trim()
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value))
const normalizedNrc = (value) => digits(value).replace(/^0+(?=\d)/, '')

function validateIssuer(company = {}) {
  const errors = []
  const nit = digits(company.nit)
  const nrc = digits(company.nrc)
  const phone = digits(company.phone)
  if (nit && ![9, 14].includes(nit.length)) errors.push('NIT debe contener 9 o 14 dígitos')
  if (nrc && (nrc.length < 1 || nrc.length > 8)) errors.push('NRC debe contener entre 1 y 8 dígitos')
  if (text(company.activity_code) && !/^\d{5,6}$/.test(text(company.activity_code))) errors.push('código de actividad inválido')
  if (text(company.department_code) && !/^\d{2}$/.test(text(company.department_code))) errors.push('departamento inválido')
  if (text(company.municipality_code) && !/^\d{2}$/.test(text(company.municipality_code))) errors.push('municipio inválido')
  if (text(company.district_code) && !/^\d{2}$/.test(text(company.district_code))) errors.push('distrito inválido')
  if (phone && phone.length !== 8) errors.push('teléfono debe contener 8 dígitos')
  if (text(company.email) && !validEmail(company.email)) errors.push('correo inválido')
  if (text(company.establishment_code) && !/^[A-Z0-9]{4}$/i.test(text(company.establishment_code))) errors.push('código de establecimiento debe contener 4 caracteres alfanuméricos')
  if (text(company.point_of_sale_code) && !/^[A-Z0-9]{4}$/i.test(text(company.point_of_sale_code))) errors.push('código de punto de venta debe contener 4 caracteres alfanuméricos')
  return errors
}

function validateDte01Receiver(client = {}) {
  const errors = []
  const type = text(client.document_type)
  const number = type === '13' || type === '36' ? digits(client.document_number) : text(client.document_number)
  if (type === '13' && number.length !== 9) errors.push('DUI del receptor debe contener 9 dígitos')
  if (type === '36' && ![9, 14].includes(number.length)) errors.push('NIT del receptor debe contener 9 o 14 dígitos')
  if (text(client.email) && !validEmail(client.email)) errors.push('correo del receptor inválido')
  return errors
}

function validateCcfReceiver(client = {}) {
  const errors = []
  const nit = digits(client.tax_id)
  const nrc = digits(client.nrc)
  if (nit && ![9, 14].includes(nit.length)) errors.push('NIT del receptor debe contener 9 o 14 dígitos')
  if (nrc && (nrc.length < 1 || nrc.length > 8)) errors.push('NRC del receptor debe contener entre 1 y 8 dígitos')
  if (text(client.email) && !validEmail(client.email)) errors.push('correo del receptor inválido')
  return errors
}

function readiness(record, fields, validator = null) {
  const missing = fields.filter(([key]) => !text(record?.[key])).map(([, label]) => label)
  const invalid = validator ? validator(record) : []
  return { ready: missing.length === 0 && invalid.length === 0, missing, invalid }
}

export const getIssuerReadiness = (company) => readiness(company, ISSUER_FIELDS, validateIssuer)
export const getReceiverReadiness = (client) => readiness(client, RECEIVER_FIELDS, validateDte01Receiver)
export const getCcfReceiverReadiness = (client) => readiness(client, CCF_RECEIVER_FIELDS, validateCcfReceiver)

export function mapCompanyToDteIssuer(company) {
  const status = getIssuerReadiness(company)
  if (!status.ready) {
    const problems = [...status.missing, ...status.invalid]
    throw new Error(`Expediente fiscal del emisor inválido o incompleto: ${problems.join(', ')}.`)
  }
  return {
    nit: digits(company.nit), nrc: digits(company.nrc), nombre: text(company.name),
    codActividad: text(company.activity_code), descActividad: text(company.business_activity),
    nombreComercial: text(company.trade_name) || null,
    direccion: { departamento: text(company.department_code), municipio: text(company.municipality_code), distrito: text(company.district_code), complemento: text(company.address) },
    telefono: digits(company.phone), correo: text(company.email).toLowerCase(),
    codEstable: text(company.establishment_code).toUpperCase(), codPuntoVenta: text(company.point_of_sale_code).toUpperCase(),
  }
}

export function mapClientToDteReceiver(client) {
  const status = getReceiverReadiness(client)
  if (!status.ready) {
    const problems = [...status.missing, ...status.invalid]
    throw new Error(`Expediente fiscal del receptor inválido o incompleto: ${problems.join(', ')}.`)
  }
  const tipoDocumento = text(client.document_type)
  const numDocumento = ['13', '36'].includes(tipoDocumento) ? digits(client.document_number) : text(client.document_number)
  // MH permite NRC en FE cuando corresponde al NIT informado. Con identificación 13-DUI se omite.
  const nrc = tipoDocumento === '36' && client.nrc ? normalizedNrc(client.nrc) : null
  return {
    tipoDocumento,
    numDocumento,
    nrc,
    nombre: text(client.name),
    codActividad: text(client.activity_code) || null,
    descActividad: text(client.business_activity) || null,
    direccion: { departamento: text(client.department_code), municipio: text(client.municipality_code), distrito: text(client.district_code), complemento: text(client.address) },
    telefono: digits(client.phone) || null,
    correo: text(client.email).toLowerCase() || null,
  }
}

export function mapClientToCcfReceiver(client) {
  const status = getCcfReceiverReadiness(client)
  if (!status.ready) {
    const problems = [...status.missing, ...status.invalid]
    throw new Error(`Para Crédito Fiscal completa en Clientes: ${problems.join(', ')}.`)
  }
  return {
    nit: digits(client.tax_id), nrc: digits(client.nrc), nombre: text(client.name),
    codActividad: text(client.activity_code), descActividad: text(client.business_activity),
    nombreComercial: text(client.trade_name) || null,
    direccion: { departamento: text(client.department_code), municipio: text(client.municipality_code), distrito: text(client.district_code), complemento: text(client.address) },
    telefono: digits(client.phone), correo: text(client.email).toLowerCase(),
  }
}

export function buildFacturaFromRecords({ company, client = null, ...sale }) {
  return buildFacturaElectronica({ ...sale, emisor: mapCompanyToDteIssuer(company), receptor: client ? mapClientToDteReceiver(client) : null })
}

export function buildCreditoFiscalFromRecords({ company, client, ...sale }) {
  return buildCreditoFiscal({ ...sale, emisor: mapCompanyToDteIssuer(company), receptor: mapClientToCcfReceiver(client) })
}
