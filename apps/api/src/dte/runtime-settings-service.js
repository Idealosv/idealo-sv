import { getDteProductionPreflightStatus } from './config.js'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function authorize({ request, supabase }) {
  const token = bearerToken(request)
  if (!token) { const error = new Error('Debes iniciar sesión.'); error.statusCode = 401; throw error }
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) { const error = new Error('La sesión no es válida o ya venció.'); error.statusCode = 401; throw error }
  const companyId = request.query?.companyId || request.body?.companyId
  if (!companyId) { const error = new Error('Debes indicar la empresa.'); error.statusCode = 400; throw error }
  const { data: membership, error: membershipError } = await supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) { const error = new Error('No tienes permiso para administrar DTE de esta empresa.'); error.statusCode = 403; throw error }
  return { companyId, userId: userData.user.id, role: membership.role }
}

export async function getRuntimeSettings({ request, supabase, env = process.env }) {
  const { companyId } = await authorize({ request, supabase })
  const { data, error } = await supabase.from('dte_runtime_settings').select('*').eq('company_id', companyId).maybeSingle()
  if (error) throw error
  const row = data || { company_id: companyId, environment: 'test', production_enabled: false, production_approved: false }
  const effectiveEnv = {
    ...env,
    DTE_ENVIRONMENT: row.environment,
    DTE_ENABLE_PRODUCTION: row.production_enabled ? 'true' : 'false',
    DTE_PRODUCTION_APPROVAL: row.production_approved ? 'IDEALO_SV_PRODUCTION_APPROVED' : '',
  }
  return {
    companyId,
    environment: row.environment,
    productionEnabled: Boolean(row.production_enabled),
    productionApproved: Boolean(row.production_approved),
    approvedAt: row.approved_at || null,
    updatedAt: row.updated_at || null,
    preflight: getDteProductionPreflightStatus(effectiveEnv),
  }
}

export async function updateRuntimeSettings({ request, supabase, env = process.env }) {
  const { companyId, userId } = await authorize({ request, supabase })
  const { environment, productionEnabled, productionApproved, confirmation } = request.body || {}
  if (!['test', 'production'].includes(environment)) { const error = new Error('Ambiente inválido.'); error.statusCode = 400; throw error }

  if (environment === 'production') {
    if (confirmation !== 'ACTIVAR PRODUCCION DTE') { const error = new Error('Para seleccionar PRODUCCIÓN debes escribir exactamente: ACTIVAR PRODUCCION DTE'); error.statusCode = 409; throw error }
    if (productionEnabled !== true || productionApproved !== true) { const error = new Error('PRODUCCIÓN requiere habilitación y aprobación explícita.'); error.statusCode = 409; throw error }
  }

  const payload = {
    company_id: companyId,
    environment,
    production_enabled: environment === 'production' ? true : Boolean(productionEnabled),
    production_approved: environment === 'production' ? true : Boolean(productionApproved),
    approved_at: environment === 'production' ? new Date().toISOString() : null,
    approved_by: environment === 'production' ? userId : null,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
  const { error } = await supabase.from('dte_runtime_settings').upsert(payload, { onConflict: 'company_id' })
  if (error) throw error
  request.query = { ...(request.query || {}), companyId }
  return getRuntimeSettings({ request, supabase, env })
}

export async function buildCompanyDteEnv({ companyId, supabase, env = process.env }) {
  const { data, error } = await supabase.from('dte_runtime_settings').select('environment, production_enabled, production_approved').eq('company_id', companyId).maybeSingle()
  if (error) throw error
  const row = data || { environment: 'test', production_enabled: false, production_approved: false }
  return {
    ...env,
    DTE_ENVIRONMENT: row.environment,
    DTE_ENABLE_PRODUCTION: row.production_enabled ? 'true' : 'false',
    DTE_PRODUCTION_APPROVAL: row.production_approved ? 'IDEALO_SV_PRODUCTION_APPROVED' : '',
  }
}
