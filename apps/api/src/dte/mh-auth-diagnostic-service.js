import { getDteConfig } from './config.js'
import { MhDteClient } from './mh-client.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export function classifyMhAuthFailure(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const message = String(error?.message || '')
  if (status === 401 || status === 403) return { kind: 'AUTH', message: `Hacienda rechazó las credenciales (HTTP ${status}).` }
  if (/superó\s+\d+\s+ms|timeout|aborted|abort/i.test(message)) return { kind: 'TIMEOUT', message: 'Hacienda no respondió dentro del tiempo de espera.' }
  if (/fetch|network|econn|enotfound|socket|conectar/i.test(message)) return { kind: 'NETWORK', message: 'No fue posible conectar con el servicio de autenticación de Hacienda.' }
  if (status >= 400) return { kind: 'HTTP', message: `Hacienda respondió HTTP ${status}.` }
  if (/token de autenticación/i.test(message)) return { kind: 'TOKEN', message: 'Hacienda respondió, pero no entregó token de autenticación.' }
  return { kind: 'UNKNOWN', message: 'No se pudo completar la autenticación con Hacienda.' }
}

export async function diagnoseMhAuthentication({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const token = bearerToken(request)
  if (!token) { const error = new Error('Debes iniciar sesión para comprobar la autenticación con Hacienda.'); error.statusCode = 401; throw error }
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) { const error = new Error('La sesión no es válida o ya venció.'); error.statusCode = 401; throw error }
  const companyId = request.query?.companyId || request.body?.companyId
  if (!companyId) { const error = new Error('Debes indicar la empresa para comprobar Hacienda.'); error.statusCode = 400; throw error }
  const { data: membership, error: membershipError } = await supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) { const error = new Error('No tienes permiso para comprobar DTE de esta empresa.'); error.statusCode = 403; throw error }

  const companyEnv = await buildCompanyDteEnv({ companyId, supabase, env })
  const config = getDteConfig(companyEnv)
  const startedAt = Date.now()
  try {
    const client = new MhDteClient(config, { fetchImpl })
    await client.authenticate()
    return { ok: true, environment: config.environment, endpoint: new URL(config.mhBaseUrl).host, authenticated: true, tokenReceived: true, transmittedDocument: false, elapsedMs: Date.now() - startedAt, checkedAt: new Date().toISOString() }
  } catch (error) {
    const failure = classifyMhAuthFailure(error)
    return { ok: false, environment: config.environment, endpoint: new URL(config.mhBaseUrl).host, authenticated: false, tokenReceived: false, transmittedDocument: false, failureKind: failure.kind, message: failure.message, elapsedMs: Date.now() - startedAt, checkedAt: new Date().toISOString() }
  }
}
