import { getDteConfig } from './config.js'
import { MhDteClient } from './mh-client.js'
import { registerProcessedTestEvidence } from './test-scenario-service.js'
import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'

function mhStatus(response) {
  const value = response?.body || response || {}
  return String(value.estado || value.status || '').toUpperCase()
}

function mhErrorDetail(body) {
  const value = body?.body || body || {}
  if (typeof value === 'string') return value.slice(0, 500)
  const candidates = [
    value.mensaje,
    value.message,
    value.descripcionMsg,
    value.descripcion,
    value.detalle,
    value.error,
    Array.isArray(value.observaciones) ? value.observaciones.join(' | ') : value.observaciones,
  ]
  return candidates.find((item) => typeof item === 'string' && item.trim())?.trim().slice(0, 500) || ''
}

export function buildTestReceptionPayload(document, attemptNumber = 1) {
  return {
    ambiente: '00',
    idEnvio: attemptNumber,
    version: Number(document.dte_payload?.identificacion?.version || 2),
    tipoDte: String(document.dte_payload?.identificacion?.tipoDte || document.dte_type || '01'),
    documento: document.signed_document,
    codigoGeneracion: String(document.generation_code).toUpperCase(),
  }
}

export function buildMhPublicError(error, phase = 'recepcion') {
  const detail = mhErrorDetail(error?.body)
  const label = phase === 'autenticacion' ? 'autenticación' : 'recepción del DTE'
  const message = detail
    ? `Hacienda TEST rechazó la ${label}: ${detail}`
    : `Hacienda TEST rechazó la ${label}${error?.status ? ` (HTTP ${error.status})` : ''}.`
  const publicError = new Error(message)
  publicError.statusCode = 400
  publicError.mhBody = error?.body || null
  publicError.mhPhase = phase
  return publicError
}

export function nextTransmissionAttempt(existingAttempts = []) {
  const attempts = [...existingAttempts].sort((a, b) => Number(a.attempt_number || 0) - Number(b.attempt_number || 0))
  const active = attempts.find((attempt) => !attempt.finished_at)
  if (active) {
    const error = new Error(`El intento ${active.attempt_number} todavía está en curso. Esperá su resultado antes de reenviar.`)
    error.statusCode = 409
    throw error
  }
  if (attempts.length >= 3) {
    const error = new Error('Este DTE alcanzó el máximo de 3 intentos de transmisión TEST. Revisá la configuración antes de crear y firmar un DTE nuevo.')
    error.statusCode = 409
    throw error
  }
  return attempts.length + 1
}

export async function transmitSignedTestDte({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const user = await requireAuthenticatedUser({ request, supabase })

  const { documentId } = request.body || {}
  if (!documentId) {
    const error = new Error('Debes indicar el DTE firmado que deseas enviar a Hacienda TEST.')
    error.statusCode = 400
    throw error
  }

  const { data: document, error: documentError } = await supabase
    .from('dte_documents')
    .select('id, company_id, dte_type, generation_code, control_number, environment, status, dte_payload, signed_document, mh_response')
    .eq('id', documentId)
    .single()
  if (documentError) throw documentError

  await requireCompanyRole({
    supabase,
    companyId: document.company_id,
    userId: user.id,
    allowedRoles: DTE_ROLES.TRANSMIT_TEST,
    operation: 'transmitir DTE al ambiente TEST de Hacienda',
  })

  if (document.environment !== 'test' || document.dte_payload?.identificacion?.ambiente !== '00') {
    const error = new Error('Este endpoint está bloqueado exclusivamente al ambiente TEST 00 de Hacienda.')
    error.statusCode = 409
    throw error
  }

  const identification = document.dte_payload?.identificacion || {}
  if (Number(identification.tipoModelo) === 2 || Number(identification.tipoOperacion) === 2 || identification.tipoContingencia) {
    const error = new Error('Este DTE fue preparado para contingencia. No puede enviarse por recepción individual; primero reportá el evento de contingencia y luego usá la recepción por lotes.')
    error.statusCode = 409
    error.code = 'DTE_CONTINGENCY_REQUIRES_BATCH'
    throw error
  }

  const config = getDteConfig(env)
  if (config.environment !== 'test' || config.mhBaseUrl.includes('api.dtes.mh.gob.sv')) {
    const error = new Error('La API no está configurada de forma segura para Hacienda TEST.')
    error.statusCode = 409
    throw error
  }

  if (document.status === 'PROCESSED') {
    return { ...document, alreadyProcessed: true, transmissionAttempted: false }
  }
  if (document.status === 'REJECTED') {
    const error = new Error('Hacienda rechazó este DTE. No se reenvía automáticamente el mismo documento firmado; corregí la causa y generá un DTE nuevo.')
    error.statusCode = 409
    throw error
  }
  if (document.status !== 'SIGNED' || !document.signed_document) {
    const error = new Error(`Solo se pueden transmitir documentos SIGNED. Estado actual: ${document.status}.`)
    error.statusCode = 409
    throw error
  }

  const { data: claimed, error: claimError } = await supabase
    .from('dte_documents')
    .update({ status: 'TRANSMITTING', updated_at: new Date().toISOString() })
    .eq('id', document.id)
    .eq('status', 'SIGNED')
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) {
    const error = new Error('Este DTE ya está siendo transmitido o cambió de estado. No se enviará por segunda vez.')
    error.statusCode = 409
    throw error
  }

  let attempt = null
  try {
    const { data: existingAttempts, error: attemptsError } = await supabase
      .from('dte_transmission_attempts')
      .select('id, attempt_number, response_payload, error_message, started_at, finished_at')
      .eq('dte_document_id', document.id)
      .order('attempt_number', { ascending: true })
    if (attemptsError) throw attemptsError

    const attemptNumber = nextTransmissionAttempt(existingAttempts || [])
    const payload = buildTestReceptionPayload(document, attemptNumber)
    const { data: createdAttempt, error: attemptError } = await supabase
      .from('dte_transmission_attempts')
      .insert({
        dte_document_id: document.id,
        attempt_number: attemptNumber,
        request_payload: payload,
      })
      .select('id')
      .single()
    if (attemptError) throw attemptError
    attempt = createdAttempt

    const mh = new MhDteClient(config, { fetchImpl })
    try {
      await mh.authenticate()
    } catch (error) {
      throw buildMhPublicError(error, 'autenticacion')
    }

    let response
    try {
      response = await mh.receive(payload)
    } catch (error) {
      throw buildMhPublicError(error, 'recepcion')
    }

    const status = mhStatus(response) === 'PROCESADO' ? 'PROCESSED' : 'REJECTED'
    const now = new Date().toISOString()

    const { error: attemptUpdateError } = await supabase
      .from('dte_transmission_attempts')
      .update({ response_payload: response, finished_at: now })
      .eq('id', attempt.id)
    if (attemptUpdateError) throw attemptUpdateError

    const { data: updated, error: documentUpdateError } = await supabase
      .from('dte_documents')
      .update({ status, mh_response: response, updated_at: now })
      .eq('id', document.id)
      .eq('status', 'TRANSMITTING')
      .select('id, control_number, generation_code, environment, status, mh_response, updated_at')
      .maybeSingle()
    if (documentUpdateError) throw documentUpdateError
    if (!updated) {
      const error = new Error('El DTE cambió de estado durante la transmisión y no se sobrescribirá la respuesta de Hacienda.')
      error.statusCode = 409
      throw error
    }

    let completedScenarioCodes = []
    if (status === 'PROCESSED') {
      try {
        completedScenarioCodes = await registerProcessedTestEvidence({
          supabase,
          document: { ...document, status },
        })
      } catch (evidenceError) {
        console.error('No se pudo sincronizar la evidencia interna de pruebas MH:', evidenceError)
      }
    }

    return {
      ...updated,
      transmissionAttempted: true,
      attemptNumber,
      productionAllowed: false,
      completedScenarioCodes,
    }
  } catch (error) {
    const now = new Date().toISOString()
    const documentRejected = error.mhPhase === 'recepcion' && Boolean(error.mhBody)
    if (attempt?.id) {
      await supabase
        .from('dte_transmission_attempts')
        .update({
          response_payload: error.mhBody || null,
          error_message: error.message,
          finished_at: now,
        })
        .eq('id', attempt.id)
    }
    await supabase
      .from('dte_documents')
      .update({
        status: documentRejected ? 'REJECTED' : 'SIGNED',
        mh_response: error.mhBody || document.mh_response || null,
        mh_message: error.message,
        updated_at: now,
      })
      .eq('id', document.id)
      .eq('status', 'TRANSMITTING')
    throw error
  }
}
