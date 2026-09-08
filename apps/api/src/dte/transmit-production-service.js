import { getDteConfig, getDteProductionPreflightStatus } from './config.js'
import { MhDteClient } from './mh-client.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'
import { sendProcessedInvoiceEmail } from './invoice-email-service.js'

function bearerToken(request) { const authorization = request.headers.authorization || ''; return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '' }
function mhStatus(response) { const value = response?.body || response || {}; return String(value.estado || value.status || '').toUpperCase() }
function buildPublicMhError(error, phase = 'recepcion') {
  const value = error?.body?.body || error?.body || {}
  const detail = [value.mensaje, value.message, value.descripcionMsg, value.descripcion, value.detalle, value.error].find((item) => typeof item === 'string' && item.trim())?.trim().slice(0, 500)
  const publicError = new Error(detail ? `Hacienda PRODUCCIÓN rechazó la ${phase === 'autenticacion' ? 'autenticación' : 'recepción del DTE'}: ${detail}` : `Hacienda PRODUCCIÓN rechazó la ${phase === 'autenticacion' ? 'autenticación' : 'recepción del DTE'}${error?.status ? ` (HTTP ${error.status})` : ''}.`)
  publicError.statusCode = 400; publicError.mhBody = error?.body || null; publicError.mhPhase = phase; return publicError
}
export function productionConfirmation(controlNumber) { return `TRANSMITIR PRODUCCION ${String(controlNumber || '').trim()}` }
export function buildProductionReceptionPayload(document, attemptNumber = 1) { return { ambiente: '01', idEnvio: attemptNumber, version: Number(document.dte_payload?.identificacion?.version || 2), tipoDte: String(document.dte_payload?.identificacion?.tipoDte || document.dte_type || '01'), documento: document.signed_document, codigoGeneracion: String(document.generation_code).toUpperCase() } }

export async function transmitSignedProductionDte({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const token = bearerToken(request)
  if (!token) { const error = new Error('Debes iniciar sesión para transmitir un DTE de PRODUCCIÓN.'); error.statusCode = 401; throw error }
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) { const error = new Error('La sesión no es válida o ya venció.'); error.statusCode = 401; throw error }
  const { documentId, confirmation } = request.body || {}
  if (!documentId) { const error = new Error('Debes indicar el DTE firmado de PRODUCCIÓN.'); error.statusCode = 400; throw error }

  const { data: document, error: documentError } = await supabase.from('dte_documents').select('id, company_id, dte_type, generation_code, control_number, environment, status, dte_payload, signed_document, mh_response').eq('id', documentId).single()
  if (documentError) throw documentError
  const { data: membership, error: membershipError } = await supabase.from('company_members').select('role').eq('company_id', document.company_id).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) { const error = new Error('No tienes permiso para transmitir DTE de esta empresa.'); error.statusCode = 403; throw error }
  if (String(membership.role || '').toLowerCase() !== 'owner') { const error = new Error('Solo el propietario de la empresa puede transmitir DTE en PRODUCCIÓN.'); error.statusCode = 403; error.code = 'DTE_OWNER_REQUIRED'; throw error }

  const { data: company, error: companyError } = await supabase.from('companies').select('demo_mode,demo_expires_at').eq('id', document.company_id).maybeSingle()
  if (companyError) throw companyError
  if (company?.demo_mode) { const error = new Error('ENTORNO DEMO: la transmisión DTE de PRODUCCIÓN está bloqueada. Utilizá ambiente TEST para la evaluación.'); error.statusCode = 409; error.code = 'DEMO_PRODUCTION_BLOCKED'; throw error }

  const companyEnv = await buildCompanyDteEnv({ companyId: document.company_id, supabase, env })
  const preflight = getDteProductionPreflightStatus(companyEnv)
  if (!preflight.configurationReady) { const error = new Error(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers || []).join(' ')}`); error.statusCode = 409; throw error }
  const config = getDteConfig(companyEnv)
  if (config.environment !== 'production' || !config.mhBaseUrl.includes('api.dtes.mh.gob.sv')) { const error = new Error('La API no está configurada para el endpoint oficial de PRODUCCIÓN de Hacienda.'); error.statusCode = 409; throw error }

  if (document.environment !== 'production' || document.dte_payload?.identificacion?.ambiente !== '01') { const error = new Error('Este endpoint acepta exclusivamente DTE preparados para ambiente PRODUCCIÓN 01.'); error.statusCode = 409; throw error }
  if (document.status === 'PROCESSED') return { ...document, alreadyProcessed: true, transmissionAttempted: false }
  if (document.status === 'REJECTED') { const error = new Error('Este DTE ya fue rechazado por Hacienda. Generá un DTE nuevo después de corregir la causa.'); error.statusCode = 409; throw error }
  if (document.status !== 'SIGNED' || !document.signed_document) { const error = new Error(`Solo se pueden transmitir documentos SIGNED. Estado actual: ${document.status}.`); error.statusCode = 409; throw error }

  const expectedConfirmation = productionConfirmation(document.control_number)
  if (confirmation !== expectedConfirmation) { const error = new Error(`Confirmación inválida. Debes confirmar exactamente: ${expectedConfirmation}`); error.statusCode = 409; throw error }

  const { data: claimed, error: claimError } = await supabase.from('dte_documents').update({ status: 'TRANSMITTING', updated_at: new Date().toISOString() }).eq('id', document.id).eq('status', 'SIGNED').select('id').maybeSingle()
  if (claimError) throw claimError
  if (!claimed) { const error = new Error('Este DTE ya está siendo transmitido o cambió de estado. No se enviará por segunda vez.'); error.statusCode = 409; throw error }

  const { data: existingAttempts, error: attemptsError } = await supabase.from('dte_transmission_attempts').select('id, attempt_number, finished_at').eq('dte_document_id', document.id).order('attempt_number', { ascending: true })
  if (attemptsError) throw attemptsError
  if ((existingAttempts || []).some((attempt) => !attempt.finished_at)) { await supabase.from('dte_documents').update({ status: 'SIGNED', updated_at: new Date().toISOString() }).eq('id', document.id).eq('status', 'TRANSMITTING'); const error = new Error('Existe un intento de transmisión todavía abierto para este DTE. No se enviará otra vez.'); error.statusCode = 409; throw error }
  if ((existingAttempts || []).length > 0) { await supabase.from('dte_documents').update({ status: 'SIGNED', updated_at: new Date().toISOString() }).eq('id', document.id).eq('status', 'TRANSMITTING'); const error = new Error('Un DTE de PRODUCCIÓN solo puede tener un intento deliberado desde este endpoint. Si hubo una falla incierta, debe revisarse antes de cualquier acción adicional.'); error.statusCode = 409; throw error }

  const attemptNumber = 1
  const payload = buildProductionReceptionPayload(document, attemptNumber)
  const { data: attempt, error: attemptError } = await supabase.from('dte_transmission_attempts').insert({ dte_document_id: document.id, attempt_number: attemptNumber, request_payload: payload }).select('id').single()
  if (attemptError) { await supabase.from('dte_documents').update({ status: 'SIGNED', updated_at: new Date().toISOString() }).eq('id', document.id).eq('status', 'TRANSMITTING'); throw attemptError }

  const mh = new MhDteClient(config, { fetchImpl })
  try {
    try { await mh.authenticate() } catch (error) { throw buildPublicMhError(error, 'autenticacion') }
    let response
    try { response = await mh.receive(payload) } catch (error) { throw buildPublicMhError(error, 'recepcion') }
    const status = mhStatus(response) === 'PROCESADO' ? 'PROCESSED' : 'REJECTED'
    const now = new Date().toISOString()
    await supabase.from('dte_transmission_attempts').update({ response_payload: response, finished_at: now }).eq('id', attempt.id)
    const { data: updated, error: updateError } = await supabase.from('dte_documents').update({ status, mh_response: response, updated_at: now }).eq('id', document.id).select('id, control_number, generation_code, environment, status, mh_response, updated_at').single()
    if (updateError) throw updateError

    let emailDelivery = null
    if (status === 'PROCESSED') {
      try {
        emailDelivery = await sendProcessedInvoiceEmail({
          supabase,
          env,
          document: { ...document, status, mh_response: response },
        })
      } catch (emailError) {
        console.error('DTE aceptado, pero no se pudo procesar el correo automático:', emailError)
        emailDelivery = { attempted: true, status: 'failed', error: emailError.message }
      }
    }

    return { ...updated, transmissionAttempted: true, attemptNumber, production: true, emailDelivery }
  } catch (error) {
    const now = new Date().toISOString(); const rejectedByMh = error.mhPhase === 'recepcion' && Boolean(error.mhBody)
    await supabase.from('dte_transmission_attempts').update({ response_payload: error.mhBody || null, error_message: error.message, finished_at: now }).eq('id', attempt.id)
    await supabase.from('dte_documents').update({ status: rejectedByMh ? 'REJECTED' : 'TRANSMISSION_UNKNOWN', mh_response: error.mhBody || document.mh_response || null, mh_message: error.message, updated_at: now }).eq('id', document.id)
    throw error
  }
}
