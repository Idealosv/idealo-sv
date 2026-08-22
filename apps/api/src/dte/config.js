const MH_BASE_URLS = Object.freeze({
  test: 'https://apitest.dtes.mh.gob.sv',
  production: 'https://api.dtes.mh.gob.sv',
})

function required(name, env) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Falta la variable privada ${name}.`)
  return value
}

export function getDteConfig(env = process.env) {
  const environment = env.DTE_ENVIRONMENT?.trim() || 'test'
  if (!Object.hasOwn(MH_BASE_URLS, environment)) {
    throw new Error('DTE_ENVIRONMENT debe ser test o production.')
  }

  if (environment === 'production' && env.DTE_ENABLE_PRODUCTION !== 'true') {
    throw new Error('Producción DTE está bloqueada. Define DTE_ENABLE_PRODUCTION=true de forma deliberada.')
  }

  return Object.freeze({
    environment,
    mhBaseUrl: env.DTE_MH_BASE_URL?.trim() || MH_BASE_URLS[environment],
    signerUrl: required('DTE_SIGNER_URL', env).replace(/\/$/, ''),
    nit: required('DTE_MH_NIT', env),
    apiPassword: required('DTE_MH_API_PASSWORD', env),
    signerPassword: required('DTE_SIGNER_PASSWORD', env),
    requestTimeoutMs: Number(env.DTE_REQUEST_TIMEOUT_MS || 8000),
    maxResends: Math.min(Number(env.DTE_MAX_RESENDS || 2), 2),
  })
}

export function getDteConfigurationStatus(env = process.env) {
  const environment = env.DTE_ENVIRONMENT?.trim() || 'test'
  const requiredNames = ['DTE_SIGNER_URL', 'DTE_MH_NIT', 'DTE_MH_API_PASSWORD', 'DTE_SIGNER_PASSWORD']
  return {
    environment,
    configured: requiredNames.every((name) => Boolean(env[name]?.trim())),
    productionEnabled: env.DTE_ENABLE_PRODUCTION === 'true',
  }
}
