import { getDteSignerConfig } from './config.js'
import { DteSignerClient } from './signer-client.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export function extractSignedDocument(response) {
  const value = response?.body || response
  const document = value?.documento || value?.document || value
  return typeof document === 'string' && document.trim() ? document.trim() : null
}

export async function signTestDteDraft({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para firmar un DTE.')
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

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', document.company_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para firmar DTE de esta empresa.')
    error.statusCode = 403
    throw error
  }

  if (document.environment !== 'test' || document.dte_payload?.identificacion?.ambiente !== '00') {
    const error = new Error('Este endpoint solo permite firmar DTE del ambiente de prueba 00.')
    error.statusCode = 409
    throw error
  }

  if (document.status === 'SIGNED' && document.signed_document) {
    return {
      id: document.id,
      control_number: document.control_number,
      generation_code: document.generation_code,
      environment: document.environment,
      status: 'SIGNED',
      alreadySigned: true,
      transmissionAllowed: false,
    }
  }

  if (document.status !== 'DRAFT') {
    const error = new Error(`Solo se pueden firmar borradores DRAFT. Estado actual: ${document.status}.`)
    error.statusCode = 409
    throw error
  }

  const signer = new DteSignerClient(getDteSignerConfig(env), { fetchImpl })

  await supabase
    .from('dte_documents')
    .update({ status: 'SIGNING', updated_at: new Date().toISOString() })
    .eq('id', document.id)

  try {
    const response = await signer.sign(document.dte_payload)
    const signed = extractSignedDocument(response)
    if (!signed) throw new Error('El firmador no devolvió el documento JWS.')

    const { data: updated, error: updateError } = await supabase
      .from('dte_documents')
      .update({
        status: 'SIGNED',
        signed_document: signed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', document.id)
      .select('id, control_number, generation_code, environment, status, updated_at')
      .single()

    if (updateError) throw updateError

    return {
      ...updated,
      alreadySigned: false,
      transmissionAllowed: false,
      transmissionAttemptsCreated: 0,
    }
  } catch (error) {
    await supabase
      .from('dte_documents')
      .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
      .eq('id', document.id)
    throw error
  }
}
