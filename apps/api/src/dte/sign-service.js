import { getDteSignerConfig, getDteProductionPreflightStatus } from './config.js'
import { DteSignerClient } from './signer-client.js'
import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'

export function extractSignedDocument(response) {
  const value = response?.body || response
  const document = value?.documento || value?.document || value
  return typeof document === 'string' && document.trim() ? document.trim() : null
}

export function productionSigningConfirmation(controlNumber) {
  return `FIRMAR PRODUCCION ${String(controlNumber || '').trim()}`
}

async function signDteDraft({ request, supabase, env = process.env, fetchImpl = fetch, production = false }) {
  const user = await requireAuthenticatedUser({ request, supabase })
  const { documentId, confirmation } = request.body || {}
  if (!documentId) {
    const error = new Error('Debes indicar el borrador DTE que deseas firmar.')
    error.statusCode = 400
    throw error
  }

  const { data: document, error: documentError } = await supabase
    .from('dte_documents')
    .select('id, company_id, control_number, generation_code, environment, status, dte_payload, signed_document')
    .eq('id', documentId)
    .single()
  if (documentError) throw documentError

  await requireCompanyRole({
    supabase,
    companyId: document.company_id,
    userId: user.id,
    allowedRoles: production ? DTE_ROLES.TRANSMIT_PRODUCTION : DTE_ROLES.SIGN,
    operation: production ? 'firmar documentos DTE de PRODUCCIÓN' : 'firmar documentos tributarios electrónicos',
  })

  const expectedEnvironment = production ? 'production' : 'test'
  const expectedMhEnvironment = production ? '01' : '00'
  if (document.environment !== expectedEnvironment || document.dte_payload?.identificacion?.ambiente !== expectedMhEnvironment) {
    const error = new Error(`Este endpoint solo permite firmar DTE del ambiente ${production ? 'PRODUCCIÓN 01' : 'TEST 00'}.`)
    error.statusCode = 409
    throw error
  }

  let signerEnv = env
  if (production) {
    const expectedConfirmation = productionSigningConfirmation(document.control_number)
    if (confirmation !== expectedConfirmation) {
      const error = new Error(`Confirmación inválida. Debes confirmar exactamente: ${expectedConfirmation}`)
      error.statusCode = 409
      throw error
    }
    signerEnv = await buildCompanyDteEnv({ companyId: document.company_id, supabase, env })
    const preflight = getDteProductionPreflightStatus(signerEnv)
    if (!preflight.configurationReady) {
      const error = new Error(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers || []).join(' ')}`)
      error.statusCode = 409
      throw error
    }
  }

  if (document.status === 'SIGNED' && document.signed_document) {
    return {
      id: document.id,
      control_number: document.control_number,
      generation_code: document.generation_code,
      environment: document.environment,
      status: 'SIGNED',
      alreadySigned: true,
      transmissionAllowed: production,
    }
  }

  if (document.status !== 'DRAFT') {
    const error = new Error(`Solo se pueden firmar borradores DRAFT. Estado actual: ${document.status}.`)
    error.statusCode = 409
    throw error
  }

  const { data: claimed, error: claimError } = await supabase
    .from('dte_documents')
    .update({ status: 'SIGNING', updated_at: new Date().toISOString() })
    .eq('id', document.id)
    .eq('status', 'DRAFT')
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) {
    const error = new Error('Este DTE ya está siendo firmado o cambió de estado. No se iniciará una segunda firma.')
    error.statusCode = 409
    throw error
  }

  const signer = new DteSignerClient(getDteSignerConfig(signerEnv), { fetchImpl })

  try {
    const response = await signer.sign(document.dte_payload)
    const signed = extractSignedDocument(response)
    if (!signed) throw new Error('El firmador no devolvió el documento JWS.')

    const { data: updated, error: updateError } = await supabase
      .from('dte_documents')
      .update({ status: 'SIGNED', signed_document: signed, updated_at: new Date().toISOString() })
      .eq('id', document.id)
      .eq('status', 'SIGNING')
      .select('id, control_number, generation_code, environment, status, updated_at')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) {
      const error = new Error('El DTE cambió de estado durante la firma y no se sobrescribirá el resultado.')
      error.statusCode = 409
      throw error
    }

    return {
      ...updated,
      alreadySigned: false,
      transmissionAllowed: production,
      transmissionAttemptsCreated: 0,
    }
  } catch (error) {
    await supabase
      .from('dte_documents')
      .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
      .eq('id', document.id)
      .eq('status', 'SIGNING')
    throw error
  }
}

export async function signTestDteDraft(args) {
  return signDteDraft({ ...args, production: false })
}

export async function signProductionDteDraft(args) {
  return signDteDraft({ ...args, production: true })
}
