import { buildCreditoFiscalFromRecords, buildFacturaFromRecords } from './fiscal-profile.js'

const TEST_ESTABLISHMENT_CODE = 'M001'
const TEST_POINT_OF_SALE_CODE = 'P001'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function padSequence(value) { return String(value).padStart(15, '0') }
function nextControlNumber(lastControlNumber, dteType = '01') {
  const current = Number(String(lastControlNumber || '').split('-').at(-1) || 0)
  const next = Number.isFinite(current) ? current + 1 : 1
  return `DTE-${dteType}-${TEST_ESTABLISHMENT_CODE}${TEST_POINT_OF_SALE_CODE}-${padSequence(next)}`
}

export async function createInvoiceDraft({ request, supabase }) {
  const token = bearerToken(request)
  if (!token) { const error = new Error('Debes iniciar sesión para crear una factura DTE.'); error.statusCode = 401; throw error }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) { const error = new Error('La sesión no es válida o ya venció.'); error.statusCode = 401; throw error }

  const {
    companyId, clientId = null, dteType = '01', items, condicionOperacion = 1, totalLetras, observaciones = null,
    payment = null, numPagoElectronico = null, documentoRelacionado = null, ventaTercero = null,
    apendice = null, ivaRete = 0, ivaPerci = 0, reteRenta = 0, saldoFavor = 0, totalNoGravado = 0,
    reissuedFromId = null,
  } = request.body || {}
  const type = String(dteType)
  if (!['01', '03'].includes(type)) { const error = new Error('Tipo DTE no soportado. Usa 01 o 03.'); error.statusCode = 400; throw error }
  if (!companyId || !Array.isArray(items) || items.length === 0 || !totalLetras) {
    const error = new Error(`Faltan datos obligatorios para crear el DTE-${type}.`); error.statusCode = 400; throw error
  }
  if (type === '03' && !clientId) {
    const error = new Error('El Comprobante de Crédito Fiscal requiere seleccionar un cliente contribuyente.'); error.statusCode = 400; throw error
  }

  const { data: membership, error: membershipError } = await supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) { const error = new Error('No tienes permiso para facturar en esta empresa.'); error.statusCode = 403; throw error }

  let rejectedSource = null
  if (reissuedFromId) {
    const { data, error } = await supabase.from('dte_documents')
      .select('id, company_id, client_id, dte_type, status, control_number')
      .eq('id', reissuedFromId)
      .eq('company_id', companyId)
      .single()
    if (error) throw error
    if (data.status !== 'REJECTED') {
      const reissueError = new Error('Solo se puede preparar una reemisión desde un DTE rechazado por Hacienda.')
      reissueError.statusCode = 409
      throw reissueError
    }
    if (String(data.dte_type) !== type) {
      const reissueError = new Error('La reemisión debe conservar el mismo tipo de DTE del documento rechazado.')
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

  // El correlativo se reserva de forma atómica en PostgreSQL. Así dos facturas simultáneas
  // no pueden recibir el mismo número y un DTE rechazado conserva su correlativo consumido.
  const { data: controlNumber, error: controlError } = await supabase.rpc('next_dte_control_number', {
    p_company_id: companyId,
    p_dte_type: type,
    p_environment: 'test',
  })
  if (controlError) throw controlError
  if (!controlNumber) { const error = new Error('No se pudo reservar un número de control DTE único.'); error.statusCode = 500; throw error }

  const testCompany = { ...company, establishment_code: TEST_ESTABLISHMENT_CODE, point_of_sale_code: TEST_POINT_OF_SALE_CODE }
  const normalizedItems = items.map((item) => ({
    descripcion: String(item.descripcion || '').trim(), cantidad: Number(item.cantidad), precioUni: Number(item.precioUni), montoDescu: Number(item.montoDescu || 0),
    tipoItem: Number(item.tipoItem || 2), uniMedida: Number(item.uniMedida || 59), codigo: item.codigo ? String(item.codigo).trim() : null,
    tipoVenta: item.tipoVenta || 'gravada', numeroDocumento: item.numeroDocumento || null, codTributo: item.codTributo || null,
  }))

  const common = {
    company: testCompany, client, items: normalizedItems, numeroControl: controlNumber,
    condicionOperacion: Number(condicionOperacion), totalLetras: String(totalLetras).trim(), observaciones: observaciones ? String(observaciones).trim() : null,
    payment, numPagoElectronico: numPagoElectronico || null, documentoRelacionado, ventaTercero, apendice,
    ivaRete: Number(ivaRete || 0), saldoFavor: Number(saldoFavor || 0), totalNoGravado: Number(totalNoGravado || 0),
  }
  const dte = type === '03'
    ? buildCreditoFiscalFromRecords({ ...common, ivaPerci: Number(ivaPerci || 0), reteRenta: Number(reteRenta || 0) })
    : buildFacturaFromRecords(common)

  const { data: document, error: insertError } = await supabase.from('dte_documents').insert({
    company_id: companyId, client_id: client?.id || null, dte_type: type, generation_code: dte.identificacion.codigoGeneracion,
    control_number: dte.identificacion.numeroControl, environment: 'test', status: 'DRAFT', dte_payload: dte, created_by: userData.user.id,
    reissued_from_id: rejectedSource?.id || null,
  }).select('id, client_id, dte_type, generation_code, control_number, environment, status, created_at, dte_payload, reissued_from_id').single()
  if (insertError) throw insertError
  return { ...document, transmissionAllowed: false, signingPrepared: true, reissuePrepared: Boolean(rejectedSource) }
}

export const __test__ = { nextControlNumber }
