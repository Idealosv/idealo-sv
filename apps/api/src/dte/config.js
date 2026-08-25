const MH_BASE_URLS = Object.freeze({
  test: 'https://apitest.dtes.mh.gob.sv',
  production: 'https://api.dtes.mh.gob.sv',
})

const PRODUCTION_APPROVAL_PHRASE = 'IDEALO_SV_PRODUCTION_APPROVED'

function required(name, env) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Falta la variable privada ${name}.`)
  return value
}

function productionApprovalGranted(env) {
  return env.DTE_PRODUCTION_APPROVAL?.trim() === PRODUCTION_APPROVAL_PHRASE
}

export function getDteSignerConfig(env = process.env) {
  return Object.freeze({
    signerUrl: required('DTE_SIGNER_URL', env).replace(/\/$/, ''),
    signerToken: required('DTE_SIGNER_TOKEN', env),
    nit: required('DTE_MH_NIT', env),
    signerPassword: required('DTE_SIGNER_PASSWORD', env),
    requestTimeoutMs: Number(env.DTE_REQUEST_TIMEOUT_MS || 8000),
  })
}

export function getDteProductionPreflightStatus(env = process.env) {
  const environment = env.DTE_ENVIRONMENT?.trim() || 'test'
  const requiredNames = [
    'DTE_SIGNER_URL',
    'DTE_SIGNER_TOKEN',
    'DTE_MH_NIT',
    'DTE_SIGNER_PASSWORD',
    'DTE_MH_API_PASSWORD',
  ]
  const missing = requiredNames.filter((name) => !env[name]?.trim())
  const productionEnabled = env.DTE_ENABLE_PRODUCTION === 'true'
  const explicitApproval = productionApprovalGranted(env)
  const usingOfficialProductionUrl = !env.DTE_MH_BASE_URL?.trim()
    || env.DTE_MH_BASE_URL.trim().replace(/\/$/, '') === MH_BASE_URLS.production
  const blockers = []

  if (environment !== 'production') blockers.push('DTE_ENVIRONMENT todavía no está en production.')
  if (!productionEnabled) blockers.push('DTE_ENABLE_PRODUCTION permanece bloqueado.')
  if (!explicitApproval) blockers.push('Falta la aprobación explícita de producción.')
  if (missing.length) blockers.push(`Faltan ${missing.length} variable(s) privada(s) DTE.`)
  if (environment === 'production' && !usingOfficialProductionUrl) blockers.push('La URL de Hacienda no coincide con el endpoint oficial de producción.')

  return Object.freeze({
    environment,
    productionEnabled,
    explicitApproval,
    credentialsConfigured: missing.length === 0,
    usingOfficialProductionUrl,
    configurationReady: blockers.length === 0,
    transmissionEndpointAvailable: true,
    productionConfirmationRequired: true,
    duplicateProtection: true,
    blockers,
  })
}

export function getDteConfig(env = process.env) {
  const environment = env.DTE_ENVIRONMENT?.trim() || 'test'
  if (!Object.hasOwn(MH_BASE_URLS, environment)) {
    throw new Error('DTE_ENVIRONMENT debe ser test o production.')
  }

  if (environment === 'production' && env.DTE_ENABLE_PRODUCTION !== 'true') {
    throw new Error('Producción DTE está bloqueada. Define DTE_ENABLE_PRODUCTION=true de forma deliberada.')
  }
  if (environment === 'production' && !productionApprovalGranted(env)) {
    throw new Error('Producción DTE requiere aprobación explícita adicional antes de cargar configuración real.')
  }

  const mhBaseUrl = env.DTE_MH_BASE_URL?.trim() || MH_BASE_URLS[environment]
  if (environment === 'production' && mhBaseUrl.replace(/\/$/, '') !== MH_BASE_URLS.production) {
    throw new Error('La URL configurada para producción no coincide con el endpoint oficial de Hacienda.')
  }

  return Object.freeze({
    environment,
    mhBaseUrl,
    ...getDteSignerConfig(env),
    apiPassword: required('DTE_MH_API_PASSWORD', env),
    maxResends: Math.min(Number(env.DTE_MAX_RESENDS || 2), 2),
  })
}

export function getDteConfigurationStatus(env = process.env) {
  const environment = env.DTE_ENVIRONMENT?.trim() || 'test'
  const signerRequired = [
    'DTE_SIGNER_URL',
    'DTE_SIGNER_TOKEN',
    'DTE_MH_NIT',
    'DTE_SIGNER_PASSWORD',
  ]
  const requiredNames = [...signerRequired, 'DTE_MH_API_PASSWORD']
  return {
    environment,
    configured: requiredNames.every((name) => Boolean(env[name]?.trim())),
    signerConfigured: signerRequired.every((name) => Boolean(env[name]?.trim())),
    productionEnabled: env.DTE_ENABLE_PRODUCTION === 'true',
    productionApproved: productionApprovalGranted(env),
  }
}
