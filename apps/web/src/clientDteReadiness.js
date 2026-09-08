export const CCF_DTE03_REQUIRED = [
  ['tax_id', 'NIT'],
  ['nrc', 'NRC'],
  ['name', 'nombre'],
  ['activity_code', 'código de actividad'],
  ['business_activity', 'actividad económica'],
  ['department_code', 'departamento'],
  ['municipality_code', 'municipio'],
  ['district_code', 'distrito'],
  ['address', 'dirección'],
  ['phone', 'teléfono'],
  ['email', 'correo'],
]

export const CONSUMER_DTE01_REQUIRED = [
  ['name', 'nombre'],
]

const hasValue = (value) => String(value ?? '').trim().length > 0

export function getClientDteReadiness(client, dteType = client?.preferred_dte_type || '01') {
  if (!client) {
    return { ready: false, dteType, missing: ['cliente'] }
  }

  const required = dteType === '03' ? CCF_DTE03_REQUIRED : CONSUMER_DTE01_REQUIRED
  const missing = required
    .filter(([key]) => !hasValue(client[key]))
    .map(([, label]) => label)

  return {
    ready: missing.length === 0,
    dteType,
    missing,
  }
}

export function missingClientDteData(client, dteType = client?.preferred_dte_type || '01') {
  return getClientDteReadiness(client, dteType).missing
}
