import { getDteConfig } from './config.js'
import { MhDteClient } from './mh-client.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

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
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para enviar un DTE de prueba.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

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

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', document.company_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para transmitir DTE de esta empresa.')
    error.statusCode = 403
    throw error
  }

  if (document.environment !== 'test' || document.dte_payload?.identificacion?.ambiente !== '00') {
    const error = new Error('Este endpoint está bloqueado exclusivamente al ambiente TEST 00 de Hacienda.')
    error.statusCode = 409
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

  const { data: existingAttempts, error: attemptsError } = await supabase
    .from('dte_transmission_attempts')
    .select('id, attempt_number, response_payload, error_message, started_at, finished_at')
    .eq('dte_document_id', document.id)
    .order('attempt_number', { ascending: true })
  if (attemptsError) throw attemptsError

  const attemptNumber = nextTransmissionAttempt(existingAttempts || [])
  const payload = buildTestReceptionPayload(document, attemptNumber)
  const { data: attempt, error: attemptError } = await supabase
    .from('dte_transmission_attempts')
    .insert({
      dte_document_id: document.id,
      attempt_number: attemptNumber,
      request_payload: payload,
    })
    .select('id')
    .single()
  if (attemptError) throw attemptError

  const { error: transmittingError } = await supabase
    .from('dte_documents')
    .update({ status: 'TRANSMITTING', updated_at: new Date().toISOString() })
    .eq('id', document.id)
  if (transmittingError) throw transmittingError

  const mh = new MhDteClient(config, { fetchImpl })
  try {
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
      .select('id, control_number, generation_code, environment, status, mh_response, updated_at')
      .single()
    if (documentUpdateError) throw documentUpdateError

    return {
      ...updated,
      transmissionAttempted: true,
      attemptNumber,
      productionAllowed: false,
    }
  } catch (error) {
    const now = new Date().toISOString()
    const documentRejected = error.mhPhase === 'recepcion' && Boolean(error.mhBody)
    await supabase
      .from('dte_transmission_attempts')
      .update({
        response_payload: error.mhBody || null,
        error_message: error.message,
        finished_at: now,
      })
      .eq('id', attempt.id)
    await supabase
      .from('dte_documents')
      .update({
        status: documentRejected ? 'REJECTED' : 'SIGNED',
        mh_response: error.mhBody || document.mh_response || null,
        mh_message: error.message,
        updated_at: now,
      })
      .eq('id', document.id)
    throw error
  }
}
