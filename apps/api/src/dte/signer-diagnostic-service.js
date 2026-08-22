import { getDteSignerConfig } from './config.js'
import { DteSignerClient } from './signer-client.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

const digits = (value) => String(value || '').replace(/\D/g, '')

export async function diagnoseDteSigner({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para diagnosticar el firmador DTE.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

  const companyId = request.query?.companyId || request.body?.companyId
  if (!companyId) {
    const error = new Error('Debes indicar la empresa para diagnosticar el firmador.')
    error.statusCode = 400
    throw error
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members').select('role')
    .eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para diagnosticar DTE de esta empresa.')
    error.statusCode = 403
    throw error
  }

  const { data: company, error: companyError } = await supabase
    .from('companies').select('id, nit, name').eq('id', companyId).single()
  if (companyError) throw companyError

  const config = getDteSignerConfig(env)
  const signer = new DteSignerClient(config, { fetchImpl })

  let signerReachable = false
  let signerStatus = null
  let certificate = null
  let signerError = null

  try {
    signerStatus = await signer.status()
    signerReachable = true
  } catch (error) {
    signerError = error.message
  }

  try {
    certificate = await signer.diagnostic()
    signerReachable = true
  } catch (error) {
    signerError = signerError || error.message
  }

  const companyNit = digits(company.nit)
  const configuredNit = digits(config.nit)
  const mountedNit = digits(certificate?.mountedNit)
  const certificatePresent = Boolean(certificate?.certificatePresent)
  const nitMatchesCompany = Boolean(companyNit && configuredNit && companyNit === configuredNit)
  const mountedNitMatches = Boolean(mountedNit && configuredNit && mountedNit === configuredNit)

  const { data: docs, error: docsError } = await supabase
    .from('dte_documents').select('id, control_number')
    .eq('company_id', companyId).eq('dte_type', '01')
    .order('created_at', { ascending: false }).limit(10)
  if (docsError) throw docsError

  let lastMhRejection = null
  const ids = (docs || []).map((row) => row.id)
  if (ids.length) {
    const { data: attempts, error: attemptsError } = await supabase
      .from('dte_transmission_attempts')
      .select('dte_document_id, response_payload, error_message, started_at')
      .in('dte_document_id', ids)
      .order('started_at', { ascending: false }).limit(10)
    if (attemptsError) throw attemptsError

    const rejected = (attempts || []).find((attempt) => {
      const response = attempt.response_payload || {}
      return response.estado === 'RECHAZADO' || response.descripcionMsg || attempt.error_message
    })
    if (rejected) {
      const document = (docs || []).find((row) => row.id === rejected.dte_document_id)
      lastMhRejection = {
        controlNumber: document?.control_number || null,
        code: rejected.response_payload?.codigoMsg || null,
        description: rejected.response_payload?.descripcionMsg || rejected.error_message || null,
        at: rejected.started_at,
      }
    }
  }

  const signatureBlocked = lastMhRejection?.code === '802' || lastMhRejection?.description === 'Firma no válida'
  let overall = 'READY'
  if (!signerReachable || !certificatePresent || !nitMatchesCompany || !mountedNitMatches) overall = 'CONFIG_ERROR'
  else if (signatureBlocked) overall = 'MH_SIGNATURE_REJECTED'

  return {
    overall,
    signerReachable,
    signerStatus: signerReachable ? 'online' : 'offline',
    signerError,
    certificate: {
      present: certificatePresent,
      count: Number(certificate?.certificateCount || 0),
      mountedNit: certificate?.mountedNit || null,
      fingerprint: certificate?.sha256 ? String(certificate.sha256).slice(0, 16) : null,
      sizeBytes: Number(certificate?.sizeBytes || 0),
    },
    nit: {
      companyMatchesConfigured: nitMatchesCompany,
      mountedCertificateMatchesConfigured: mountedNitMatches,
    },
    lastMhRejection,
    transmissionRecommended: overall === 'READY',
  }
}
