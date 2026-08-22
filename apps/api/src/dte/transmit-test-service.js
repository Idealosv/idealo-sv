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

export function buildTestReceptionPayload(document) {
  return {
    ambiente: '00',
    idEnvio: 1,
    version: Number(document.dte_payload?.identificacion?.version || 2),
    tipoDte: String(document.dte_payload?.identificacion?.tipoDte || document.dte_type || '01'),
    documento: document.signed_document,
    codigoGeneracion: String(document.generation_code).toUpperCase(),
  }
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
  if (document.status !== 'SIGNED' || !document.signed_document) {
    const error = new Error(`Solo se pueden transmitir documentos SIGNED. Estado actual: ${document.status}.`)
    error.statusCode = 409
    throw error
  }

  const { data: existingAttempts, error: attemptsError } = await supabase
    .from('dte_transmission_attempts')
    .select('id, attempt_number, response_payload, error_message, finished_at')
    .eq('dte_document_id', document.id)
    .order('attempt_number', { ascending: true })
  if (attemptsError) throw attemptsError
  if ((existingAttempts || []).length > 0) {
    const error = new Error('Este DTE ya tiene un intento de transmisión registrado. El reenvío automático permanece bloqueado.')
    error.statusCode = 409
    throw error
  }

  const payload = buildTestReceptionPayload(document)
  const { data: attempt, error: attemptError } = await supabase
    .from('dte_transmission_attempts')
    .insert({
      dte_document_id: document.id,
      attempt_number: 1,
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
    const response = await mh.receive(payload)
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
      attemptNumber: 1,
      productionAllowed: false,
    }
  } catch (error) {
    const now = new Date().toISOString()
    await supabase
      .from('dte_transmission_attempts')
      .update({ error_message: error.message, finished_at: now })
      .eq('id', attempt.id)
    await supabase
      .from('dte_documents')
      .update({ status: 'SIGNED', updated_at: now })
      .eq('id', document.id)
    throw error
  }
}
