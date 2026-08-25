import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { getDteSignerConfig } from './config.js'
import { DteSignerClient } from './signer-client.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

const digits = (value) => String(value || '').replace(/\D/g, '')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function classifySignerFailure(error) {
  const message = String(error?.message || '')
  const status = Number(error?.status || 0)
  if (status === 401 || status === 403) return { kind: 'AUTH', message: `El firmador rechazó la credencial interna (HTTP ${status}).` }
  if (status >= 400) return { kind: 'HTTP', message: `El firmador respondió HTTP ${status}.` }
  if (/superó\s+\d+\s+ms|timeout|aborted|abort/i.test(message)) return { kind: 'TIMEOUT', message: 'El firmador no respondió dentro del tiempo de espera.' }
  if (/conectar|fetch|network|econn|enotfound|socket/i.test(message)) return { kind: 'NETWORK', message: 'No fue posible establecer conexión con el firmador.' }
  return { kind: 'UNKNOWN', message: 'El firmador no pudo completar la comprobación.' }
}

async function probeSigner({ baseConfig, fetchImpl, attempts = 3, timeoutMs = 12000, warmupTimeoutMs = 45000 }) {
  let signerStatus = null
  let certificate = null
  let lastFailure = null
  let attemptsUsed = 0
  let warmup = { attempted: false, ok: false, failure: null }

  const warmConfig = Object.freeze({ ...baseConfig, requestTimeoutMs: timeoutMs })
  const warmSigner = new DteSignerClient(warmConfig, { fetchImpl })
  warmup.attempted = true
  try {
    await warmSigner.warmup({ timeoutMs: warmupTimeoutMs })
    warmup.ok = true
    await wait(500)
  } catch (error) {
    warmup.failure = classifySignerFailure(error)
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt
    const config = Object.freeze({ ...baseConfig, requestTimeoutMs: timeoutMs })
    const signer = new DteSignerClient(config, { fetchImpl })
    const [statusResult, diagnosticResult] = await Promise.allSettled([signer.status(), signer.diagnostic()])

    if (statusResult.status === 'fulfilled') signerStatus = statusResult.value
    if (diagnosticResult.status === 'fulfilled') certificate = diagnosticResult.value

    if (signerStatus || certificate) {
      if (!certificate) {
        try { certificate = await signer.diagnostic() } catch (error) { lastFailure = classifySignerFailure(error) }
      }
      return { reachable: true, signerStatus, certificate, failure: lastFailure, attemptsUsed, timeoutMs, warmupTimeoutMs, warmup }
    }

    const statusFailure = classifySignerFailure(statusResult.reason)
    const diagnosticFailure = classifySignerFailure(diagnosticResult.reason)
    lastFailure = diagnosticFailure.kind !== 'UNKNOWN' ? diagnosticFailure : statusFailure
    if (attempt < attempts) await wait(1500)
  }

  if (!lastFailure && warmup.failure) lastFailure = warmup.failure
  return { reachable: false, signerStatus: null, certificate: null, failure: lastFailure, attemptsUsed, timeoutMs, warmupTimeoutMs, warmup }
}

function extractSignedDocument(response) {
  const value = response?.body || response
  const document = value?.documento || value?.document || value
  return typeof document === 'string' && document.trim() ? document.trim() : null
}

function base64UrlBuffer(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64')
}

function verifyJws(jws, publicKeyDer) {
  const parts = String(jws || '').split('.')
  if (parts.length !== 3) return { valid: false, algorithm: null, reason: 'JWS inválido: debe contener tres segmentos.' }

  try {
    const header = JSON.parse(base64UrlBuffer(parts[0]).toString('utf8'))
    const algorithm = header?.alg || null
    if (algorithm !== 'RS512') return { valid: false, algorithm, reason: `Algoritmo inesperado: ${algorithm || 'sin alg'}.` }

    const publicKey = createPublicKey({ key: Buffer.from(publicKeyDer, 'base64'), format: 'der', type: 'spki' })
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii')
    const signature = base64UrlBuffer(parts[2])
    const valid = verifySignature('RSA-SHA512', signingInput, publicKey, signature)
    return { valid, algorithm, reason: valid ? null : 'La firma RS512 no verifica con la clave pública del certificado montado.' }
  } catch (error) {
    return { valid: false, algorithm: null, reason: `No se pudo verificar el JWS: ${error.message}` }
  }
}

export async function diagnoseDteSigner({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const token = bearerToken(request)
  if (!token) { const error = new Error('Debes iniciar sesión para diagnosticar el firmador DTE.'); error.statusCode = 401; throw error }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) { const error = new Error('La sesión no es válida o ya venció.'); error.statusCode = 401; throw error }

  const companyId = request.query?.companyId || request.body?.companyId
  if (!companyId) { const error = new Error('Debes indicar la empresa para diagnosticar el firmador.'); error.statusCode = 400; throw error }

  const { data: membership, error: membershipError } = await supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) { const error = new Error('No tienes permiso para diagnosticar DTE de esta empresa.'); error.statusCode = 403; throw error }

  const { data: company, error: companyError } = await supabase.from('companies').select('id, nit, name').eq('id', companyId).single()
  if (companyError) throw companyError

  const baseConfig = getDteSignerConfig(env)
  const attemptTimeoutMs = Math.min(Math.max(baseConfig.requestTimeoutMs || 8000, 10000), 15000)
  const warmupTimeoutMs = Math.min(Math.max(Number(env.DTE_SIGNER_WARMUP_TIMEOUT_MS || 45000), 30000), 60000)
  const probe = await probeSigner({ baseConfig, fetchImpl, attempts: 3, timeoutMs: attemptTimeoutMs, warmupTimeoutMs })
  const config = Object.freeze({ ...baseConfig, requestTimeoutMs: attemptTimeoutMs })
  const signer = new DteSignerClient(config, { fetchImpl })
  const signerReachable = probe.reachable
  const signerStatus = probe.signerStatus
  const certificate = probe.certificate
  const signerError = probe.failure?.message || null
  const signerFailureKind = probe.failure?.kind || null

  const companyNit = digits(company.nit)
  const configuredNit = digits(config.nit)
  const mountedNit = digits(certificate?.mountedNit)
  const certificatePresent = Boolean(certificate?.certificatePresent)
  const nitMatchesCompany = Boolean(companyNit && configuredNit && companyNit === configuredNit)
  const mountedNitMatches = Boolean(mountedNit && configuredNit && mountedNit === configuredNit)
  const certificateActive = certificate?.active === true
  const nowSeconds = Date.now() / 1000
  const notBefore = Number.parseFloat(certificate?.notBefore || '')
  const notAfter = Number.parseFloat(certificate?.notAfter || '')
  const certificateInValidity = Number.isFinite(notBefore) && Number.isFinite(notAfter) && nowSeconds >= notBefore && nowSeconds <= notAfter

  let cryptoSelfTest = { valid: false, algorithm: null, reason: signerReachable ? 'No ejecutada.' : 'Firmador sin respuesta.' }
  if (certificatePresent && certificate?.publicKeyDer && signerReachable) {
    try {
      const probePayload = { diagnostico: 'IDEALO-SV-SIGNER-SELF-TEST', nit: configuredNit, timestamp: new Date().toISOString() }
      const signedProbe = extractSignedDocument(await signer.sign(probePayload))
      cryptoSelfTest = signedProbe ? verifyJws(signedProbe, certificate.publicKeyDer) : { valid: false, algorithm: null, reason: 'El firmador no devolvió JWS en la autoprueba.' }
    } catch (error) { cryptoSelfTest = { valid: false, algorithm: null, reason: classifySignerFailure(error).message } }
  }

  const { data: docs, error: docsError } = await supabase.from('dte_documents').select('id, control_number').eq('company_id', companyId).eq('dte_type', '01').order('created_at', { ascending: false }).limit(10)
  if (docsError) throw docsError

  let lastMhRejection = null
  const ids = (docs || []).map((row) => row.id)
  if (ids.length) {
    const { data: attempts, error: attemptsError } = await supabase.from('dte_transmission_attempts').select('dte_document_id, response_payload, error_message, started_at').in('dte_document_id', ids).order('started_at', { ascending: false }).limit(10)
    if (attemptsError) throw attemptsError
    const rejected = (attempts || []).find((attempt) => { const response = attempt.response_payload || {}; return response.estado === 'RECHAZADO' || response.descripcionMsg || attempt.error_message })
    if (rejected) {
      const document = (docs || []).find((row) => row.id === rejected.dte_document_id)
      lastMhRejection = { controlNumber: document?.control_number || null, code: rejected.response_payload?.codigoMsg || null, description: rejected.response_payload?.descripcionMsg || rejected.error_message || null, at: rejected.started_at }
    }
  }

  const previousSignatureRejected = lastMhRejection?.code === '802' || lastMhRejection?.description === 'Firma no válida'
  let overall = 'READY'
  if (!signerReachable) overall = 'SIGNER_UNAVAILABLE'
  else if (!certificatePresent || !nitMatchesCompany || !mountedNitMatches || !certificateActive || !certificateInValidity || !cryptoSelfTest.valid) overall = 'CONFIG_ERROR'
  else if (previousSignatureRejected) overall = 'READY_FOR_SINGLE_RETRY'

  return {
    overall,
    signerReachable,
    signerStatus: signerReachable ? 'online' : 'offline',
    signerServiceStatus: signerStatus || null,
    signerError,
    signerFailureKind,
    probeAttempts: probe.attemptsUsed,
    warmup: probe.warmup,
    diagnosticTimeoutMs: probe.warmupTimeoutMs + (probe.timeoutMs * 3) + 4000,
    certificate: { present: certificatePresent, count: Number(certificate?.certificateCount || 0), mountedNit: certificate?.mountedNit || null, fingerprint: certificate?.sha256 ? String(certificate.sha256).slice(0, 16) : null, sizeBytes: Number(certificate?.sizeBytes || 0), active: certificateActive, inValidity: certificateInValidity, notBefore: Number.isFinite(notBefore) ? new Date(notBefore * 1000).toISOString() : null, notAfter: Number.isFinite(notAfter) ? new Date(notAfter * 1000).toISOString() : null },
    nit: { companyMatchesConfigured: nitMatchesCompany, mountedCertificateMatchesConfigured: mountedNitMatches },
    cryptoSelfTest,
    lastMhRejection,
    previousSignatureRejected,
    transmissionRecommended: overall === 'READY' || overall === 'READY_FOR_SINGLE_RETRY',
  }
}
