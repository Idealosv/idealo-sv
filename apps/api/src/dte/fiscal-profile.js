import { buildFacturaElectronica } from './factura-electronica.js'

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

function readiness(record, fields) {
  const missing = fields.filter(([key]) => !String(record?.[key] || '').trim()).map(([, label]) => label)
  return { ready: missing.length === 0, missing }
}

export const getIssuerReadiness = (company) => readiness(company, ISSUER_FIELDS)
export const getReceiverReadiness = (client) => readiness(client, RECEIVER_FIELDS)

export function mapCompanyToDteIssuer(company) {
  const status = getIssuerReadiness(company)
  if (!status.ready) throw new Error(`Expediente fiscal del emisor incompleto: ${status.missing.join(', ')}.`)
  return {
    nit: company.nit,
    nrc: company.nrc,
    nombre: company.name,
    codActividad: company.activity_code,
    descActividad: company.business_activity,
    nombreComercial: company.trade_name || null,
    direccion: {
      departamento: company.department_code,
      municipio: company.municipality_code,
      distrito: company.district_code,
      complemento: company.address,
    },
    telefono: company.phone,
    correo: company.email,
    codEstable: company.establishment_code,
    codPuntoVenta: company.point_of_sale_code,
  }
}

export function mapClientToDteReceiver(client) {
  const status = getReceiverReadiness(client)
  if (!status.ready) throw new Error(`Expediente fiscal del receptor incompleto: ${status.missing.join(', ')}.`)
  return {
    tipoDocumento: client.document_type,
    numDocumento: client.document_number,
    nrc: client.nrc || null,
    nombre: client.name,
    codActividad: client.activity_code,
    descActividad: client.business_activity,
    direccion: {
      departamento: client.department_code,
      municipio: client.municipality_code,
      distrito: client.district_code,
      complemento: client.address,
    },
    telefono: client.phone,
    correo: client.email,
  }
}

export function buildFacturaFromRecords({ company, client = null, ...sale }) {
  return buildFacturaElectronica({
    ...sale,
    emisor: mapCompanyToDteIssuer(company),
    receptor: client ? mapClientToDteReceiver(client) : null,
  })
}

