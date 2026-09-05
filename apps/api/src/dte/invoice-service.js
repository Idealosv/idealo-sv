import { buildCreditoFiscalFromRecords, buildFacturaFromRecords } from './fiscal-profile.js'
import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'
import { getDteProductionPreflightStatus } from './config.js'

const TEST_ESTABLISHMENT_CODE = 'M001'
const TEST_POINT_OF_SALE_CODE = 'P001'

function padSequence(value) { return String(value).padStart(15, '0') }
function nextControlNumber(lastControlNumber, dteType = '01') {
  const current = Number(String(lastControlNumber || '').split('-').at(-1) || 0)
  const next = Number.isFinite(current) ? current + 1 : 1
  return `DTE-${dteType}-${TEST_ESTABLISHMENT_CODE}${TEST_POINT_OF_SALE_CODE}-${padSequence(next)}`
}
export function productionDraftConfirmation(dteType='01') { return `PREPARAR PRODUCCION DTE-${String(dteType)}` }

export async function createInvoiceDraft({ request, supabase, env = process.env }) {
  const user = await requireAuthenticatedUser({ request, supabase })

  const {
    companyId, clientId = null, dteType = '01', items, condicionOperacion = 1, totalLetras, observaciones = null,
    payment = null, numPagoElectronico = null, documentoRelacionado = null, ventaTercero = null,
    apendice = null, ivaRete = 0, ivaPerci = 0, reteRenta = 0, saldoFavor = 0, totalNoGravado = 0,
    reissuedFromId = null, sourceQuoteId = null, sourceWorkOrderId = null,
    environment = 'test', confirmation = null,
  } = request.body || {}
  const type = String(dteType)
  const targetEnvironment = String(environment || 'test').toLowerCase()
  if (!['01', '03'].includes(type)) { const error = new Error('Tipo DTE no soportado. Usa 01 o 03.'); error.statusCode = 400; throw error }
  if (!['test','production'].includes(targetEnvironment)) { const error = new Error('Ambiente DTE inválido. Usa test o production.'); error.statusCode = 400; throw error }
  if (!companyId || !Array.isArray(items) || items.length === 0 || !totalLetras) {
    const error = new Error(`Faltan datos obligatorios para crear el DTE-${type}.`); error.statusCode = 400; throw error
  }
  if (type === '03' && !clientId) {
    const error = new Error('El Comprobante de Crédito Fiscal requiere seleccionar un cliente contribuyente.'); error.statusCode = 400; throw error
  }

  await requireCompanyRole({
    supabase,
    companyId,
    userId: user.id,
    allowedRoles: targetEnvironment === 'production' ? DTE_ROLES.TRANSMIT_PRODUCTION : DTE_ROLES.DRAFT,
    operation: targetEnvironment === 'production' ? 'preparar DTE de PRODUCCIÓN' : 'crear borradores de facturación electrónica',
  })

  if (targetEnvironment === 'production') {
    const expected = productionDraftConfirmation(type)
    if (confirmation !== expected) { const error = new Error(`Confirmación inválida. Debes confirmar exactamente: ${expected}`); error.statusCode = 409; throw error }
    const companyEnv = await buildCompanyDteEnv({ companyId, supabase, env })
    const preflight = getDteProductionPreflightStatus(companyEnv)
    if (!preflight.configurationReady) { const error = new Error(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers || []).join(' ')}`); error.statusCode = 409; throw error }
  }

  let rejectedSource = null
  if (reissuedFromId) {
    const { data, error } = await supabase.from('dte_documents')
      .select('id, company_id, client_id, dte_type, environment, status, control_number, source_quote_id, source_work_order_id')
      .eq('id', reissuedFromId)
      .eq('company_id', companyId)
      .single()
    if (error) throw error
    if (data.status !== 'REJECTED') {
      const reissueError = new Error('Solo se puede preparar una reemisión desde un DTE rechazado por Hacienda.')
      reissueError.statusCode = 409
      throw reissueError
    }
    if (String(data.dte_type) !== type || data.environment !== targetEnvironment) {
      const reissueError = new Error('La reemisión debe conservar el mismo tipo de DTE y ambiente del documento rechazado.')
      reissueError.statusCode = 409
      throw reissueError
    }
    if ((data.client_id || null) !== (clientId || null)) {
      const reissueError = new Error('La reemisión debe conservar el mismo receptor del documento rechazado.')
      reissueError.statusCode = 409
      throw reissueError
    }
    rejectedSource = data
  }

  const { data: company, error: companyError } = await supabase.from('companies').select('*').eq('id', companyId).single()
  if (companyError) throw companyError

  let client = null
  if (clientId) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).eq('company_id', companyId).single()
    if (error) throw error
    client = data
  }

  let sourceQuote = null
  let sourceWorkOrder = null
  const effectiveQuoteId = sourceQuoteId || rejectedSource?.source_quote_id || null
  const effectiveWorkOrderId = sourceWorkOrderId || rejectedSource?.source_work_order_id || null
  if (effectiveQuoteId) {
    const { data, error } = await supabase.from('quotes').select('id, company_id, client_id').eq('id', effectiveQuoteId).eq('company_id', companyId).single()
    if (error) throw error
    if (clientId && data.client_id !== clientId) { const e = new Error('La cotización no pertenece al cliente seleccionado.'); e.statusCode = 409; throw e }
    sourceQuote = data
  }
  if (effectiveWorkOrderId) {
    const { data, error } = await supabase.from('work_orders').select('id, company_id, quote_id').eq('id', effectiveWorkOrderId).eq('company_id', companyId).single()
    if (error) throw error
    if (sourceQuote && data.quote_id !== sourceQuote.id) { const e = new Error('La orden de trabajo no corresponde a la cotización seleccionada.'); e.statusCode = 409; throw e }
    sourceWorkOrder = data
  }

  const { data: controlNumber, error: controlError } = await supabase.rpc('next_dte_control_number', {
    p_company_id: companyId,
    p_dte_type: type,
    p_environment: targetEnvironment,
  })
  if (controlError) throw controlError
  if (!controlNumber) { const error = new Error('No se pudo reservar un número de control DTE único.'); error.statusCode = 500; throw error }

  const issuerCompany = targetEnvironment === 'test'
    ? { ...company, establishment_code: TEST_ESTABLISHMENT_CODE, point_of_sale_code: TEST_POINT_OF_SALE_CODE }
    : company
  const normalizedItems = items.map((item) => ({
    descripcion: String(item.descripcion || '').trim(), cantidad: Number(item.cantidad), precioUni: Number(item.precioUni), montoDescu: Number(item.montoDescu || 0),
    tipoItem: Number(item.tipoItem || 2), uniMedida: Number(item.uniMedida || 59), codigo: item.codigo ? String(item.codigo).trim() : null,
    tipoVenta: item.tipoVenta || 'gravada', numeroDocumento: item.numeroDocumento || null, codTributo: item.codTributo || null,
  }))

  const common = {
    company: issuerCompany, client, items: normalizedItems, numeroControl: controlNumber,
    condicionOperacion: Number(condicionOperacion), totalLetras: String(totalLetras).trim(), observaciones: observaciones ? String(observaciones).trim() : null,
    payment, numPagoElectronico: numPagoElectronico || null, documentoRelacionado, ventaTercero, apendice,
    ivaRete: Number(ivaRete || 0), saldoFavor: Number(saldoFavor || 0), totalNoGravado: Number(totalNoGravado || 0),
  }
  const dte = type === '03'
    ? buildCreditoFiscalFromRecords({ ...common, ivaPerci: Number(ivaPerci || 0), reteRenta: Number(reteRenta || 0) })
    : buildFacturaFromRecords(common)
  if (targetEnvironment === 'production') dte.identificacion.ambiente = '01'

  const { data: document, error: insertError } = await supabase.from('dte_documents').insert({
    company_id: companyId, client_id: client?.id || null, dte_type: type, generation_code: dte.identificacion.codigoGeneracion,
    control_number: dte.identificacion.numeroControl, environment: targetEnvironment, status: 'DRAFT', dte_payload: dte, created_by: user.id,
    reissued_from_id: rejectedSource?.id || null, source_quote_id: sourceQuote?.id || null, source_work_order_id: sourceWorkOrder?.id || null,
  }).select('id, client_id, dte_type, generation_code, control_number, environment, status, created_at, dte_payload, reissued_from_id, source_quote_id, source_work_order_id').single()
  if (insertError) throw insertError
  return { ...document, transmissionAllowed: false, signingPrepared: true, reissuePrepared: Boolean(rejectedSource), productionPrepared: targetEnvironment === 'production' }
}

export const __test__ = { nextControlNumber, productionDraftConfirmation }
