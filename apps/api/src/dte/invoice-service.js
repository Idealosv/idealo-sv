import { buildFacturaFromRecords } from './fiscal-profile.js'

const TEST_ESTABLISHMENT_CODE = 'M001'
const TEST_POINT_OF_SALE_CODE = 'P001'

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function padSequence(value) {
  return String(value).padStart(15, '0')
}

function nextControlNumber(lastControlNumber) {
  const current = Number(String(lastControlNumber || '').split('-').at(-1) || 0)
  const next = Number.isFinite(current) ? current + 1 : 1
  return `DTE-01-${TEST_ESTABLISHMENT_CODE}${TEST_POINT_OF_SALE_CODE}-${padSequence(next)}`
}

export async function createInvoiceDraft({ request, supabase }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para crear una factura DTE.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

  const { companyId, clientId = null, items, condicionOperacion = 1, totalLetras, observaciones = null } = request.body || {}
  if (!companyId || !Array.isArray(items) || items.length === 0 || !totalLetras) {
    const error = new Error('Faltan datos obligatorios para crear la factura DTE-01.')
    error.statusCode = 400
    throw error
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members').select('role')
    .eq('company_id', companyId).eq('user_id', userData.user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para facturar en esta empresa.')
    error.statusCode = 403
    throw error
  }

  const { data: company, error: companyError } = await supabase
    .from('companies').select('*').eq('id', companyId).single()
  if (companyError) throw companyError

  let client = null
  if (clientId) {
    const { data, error } = await supabase
      .from('clients').select('*').eq('id', clientId).eq('company_id', companyId).single()
    if (error) throw error
    client = data
  }

  const { data: lastDocument, error: lastError } = await supabase
    .from('dte_documents').select('control_number')
    .eq('company_id', companyId).eq('dte_type', '01')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (lastError) throw lastError

  const controlNumber = nextControlNumber(lastDocument?.control_number)
  const testCompany = {
    ...company,
    establishment_code: TEST_ESTABLISHMENT_CODE,
    point_of_sale_code: TEST_POINT_OF_SALE_CODE,
  }

  const normalizedItems = items.map((item) => ({
    descripcion: String(item.descripcion || '').trim(),
    cantidad: Number(item.cantidad),
    precioUni: Number(item.precioUni),
    montoDescu: Number(item.montoDescu || 0),
    tipoItem: Number(item.tipoItem || 2),
    uniMedida: Number(item.uniMedida || 59),
  }))

  const dte = buildFacturaFromRecords({
    company: testCompany,
    client,
    items: normalizedItems,
    numeroControl: controlNumber,
    condicionOperacion: Number(condicionOperacion),
    totalLetras: String(totalLetras).trim(),
    observaciones: observaciones ? String(observaciones).trim() : null,
  })

  const { data: document, error: insertError } = await supabase
    .from('dte_documents')
    .insert({
      company_id: companyId,
      client_id: client?.id || null,
      dte_type: '01',
      generation_code: dte.identificacion.codigoGeneracion,
      control_number: dte.identificacion.numeroControl,
      environment: 'test',
      status: 'DRAFT',
      dte_payload: dte,
      created_by: userData.user.id,
    })
    .select('id, client_id, generation_code, control_number, environment, status, created_at, dte_payload')
    .single()
  if (insertError) throw insertError

  return { ...document, transmissionAllowed: false, signingPrepared: true }
}

export const __test__ = { nextControlNumber }
