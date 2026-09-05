import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'
import { getDteProductionPreflightStatus } from './config.js'

const CONTINGENCY_TYPES = new Set([1,2,3,4,5])

export function contingencyConfirmation(controlNumber) {
  return `PREPARAR CONTINGENCIA ${String(controlNumber || '').trim()}`
}

export async function prepareDteContingency({ request, supabase, env = process.env }) {
  const user = await requireAuthenticatedUser({ request, supabase })
  const { documentId, tipoContingencia, motivoContin, confirmation = null } = request.body || {}
  if (!documentId) { const e = new Error('documentId es obligatorio.'); e.statusCode = 400; throw e }
  const contingencyType = Number(tipoContingencia)
  if (!CONTINGENCY_TYPES.has(contingencyType)) { const e = new Error('tipoContingencia debe estar entre 1 y 5.'); e.statusCode = 400; throw e }
  const motive = String(motivoContin || '').trim()
  if (motive.length < 5) { const e = new Error('Describe el motivo de la contingencia con al menos 5 caracteres.'); e.statusCode = 400; throw e }

  const { data: document, error } = await supabase.from('dte_documents')
    .select('id,company_id,dte_type,control_number,environment,status,signed_document,dte_payload')
    .eq('id', documentId).single()
  if (error) throw error
  if (!['01','03'].includes(String(document.dte_type))) { const e = new Error('Solo DTE-01 y DTE-03 pueden prepararse desde este flujo.'); e.statusCode = 409; throw e }
  if (document.status !== 'DRAFT' || document.signed_document) { const e = new Error('La contingencia solo puede prepararse sobre un DTE en borrador y todavía no firmado.'); e.statusCode = 409; throw e }

  await requireCompanyRole({
    supabase,
    companyId: document.company_id,
    userId: user.id,
    allowedRoles: document.environment === 'production' ? DTE_ROLES.TRANSMIT_PRODUCTION : DTE_ROLES.DRAFT,
    operation: document.environment === 'production' ? 'preparar DTE de contingencia en PRODUCCIÓN' : 'preparar DTE de contingencia TEST',
  })

  if (document.environment === 'production') {
    const expected = contingencyConfirmation(document.control_number)
    if (confirmation !== expected) { const e = new Error(`Confirmación inválida. Debes confirmar exactamente: ${expected}`); e.statusCode = 409; throw e }
    const companyEnv = await buildCompanyDteEnv({ companyId: document.company_id, supabase, env })
    const preflight = getDteProductionPreflightStatus(companyEnv)
    if (!preflight.configurationReady) { const e = new Error(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers || []).join(' ')}`); e.statusCode = 409; throw e }
  }

  const payload = structuredClone(document.dte_payload || {})
  if (!payload.identificacion) { const e = new Error('El DTE no tiene bloque identificacion válido.'); e.statusCode = 409; throw e }
  payload.identificacion.tipoModelo = 2
  payload.identificacion.tipoOperacion = 2
  payload.identificacion.tipoContingencia = contingencyType
  payload.identificacion.motivoContin = motive

  const { data: updated, error: updateError } = await supabase.from('dte_documents')
    .update({ dte_payload: payload })
    .eq('id', document.id)
    .eq('status', 'DRAFT')
    .is('signed_document', null)
    .select('id,company_id,dte_type,control_number,generation_code,environment,status,dte_payload,updated_at')
    .maybeSingle()
  if (updateError) throw updateError
  if (!updated) { const e = new Error('El DTE cambió mientras se preparaba la contingencia. Actualiza e inténtalo de nuevo.'); e.statusCode = 409; throw e }

  return {
    ...updated,
    contingencyPrepared: true,
    contingency: { tipoModelo: 2, tipoOperacion: 2, tipoContingencia: contingencyType, motivoContin: motive },
  }
}

export const __test__ = { contingencyConfirmation }
