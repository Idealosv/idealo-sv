import { getDteConfig, getDteConfigurationStatus } from './config.js'
import { DteSignerClient } from './signer-client.js'

let result = Object.freeze({
  status: 'pending',
  environment: 'test',
  signed: false,
  transmitted: false,
})

export function getSignatureSelfTestStatus() {
  return result
}

export async function runSignatureSelfTest({
  env = process.env,
  createSigner = (config) => new DteSignerClient(config),
} = {}) {
  const configuration = getDteConfigurationStatus(env)

  if (configuration.environment !== 'test' || configuration.productionEnabled) {
    result = Object.freeze({
      status: 'skipped',
      environment: configuration.environment,
      signed: false,
      transmitted: false,
      reason: 'ONLY_AVAILABLE_IN_TEST',
    })
    return result
  }

  if (!configuration.configured) {
    result = Object.freeze({
      status: 'skipped',
      environment: 'test',
      signed: false,
      transmitted: false,
      reason: 'DTE_NOT_CONFIGURED',
    })
    return result
  }

  result = Object.freeze({
    status: 'running',
    environment: 'test',
    signed: false,
    transmitted: false,
  })

  try {
    const signer = createSigner(getDteConfig(env))
    const response = await signer.sign({
      prueba: {
        tipo: 'VERIFICACION_LOCAL_FIRMA',
        transmitible: false,
      },
      identificacion: {
        ambiente: '00',
        tipoDte: '01',
      },
    })
    const signedDocument = typeof response?.body === 'string'
      ? response.body
      : response?.body?.documento ?? response?.documento
    if (typeof signedDocument !== 'string' || signedDocument.length === 0) {
      const signerCode = response?.body?.codigo
      result = Object.freeze({
        status: 'failed',
        environment: 'test',
        signed: false,
        transmitted: false,
        reason: 'SIGNER_REJECTED_TEST',
        signerCode: typeof signerCode === 'string' ? signerCode : 'UNKNOWN',
        checkedAt: new Date().toISOString(),
      })
      return result
    }

    result = Object.freeze({
      status: 'passed',
      environment: 'test',
      signed: true,
      transmitted: false,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('La prueba controlada de firma DTE falló.', {
      name: error.name,
      status: error.status,
    })
    result = Object.freeze({
      status: 'failed',
      environment: 'test',
      signed: false,
      transmitted: false,
      reason: 'SIGNER_REJECTED_TEST',
      checkedAt: new Date().toISOString(),
    })
  }

  return result
}
