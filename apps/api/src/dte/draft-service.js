import { buildFacturaFromRecords } from './fiscal-profile.js'

const TEST_ESTABLISHMENT_CODE = 'M001'
const TEST_POINT_OF_SALE_CODE = 'P001'

function padSequence(value) {
  return String(value).padStart(15, '0')
}

function nextControlNumber(lastControlNumber) {
  const current = Number(String(lastControlNumber || '').split('-').at(-1) || 0)
  const next = Number.isFinite(current) ? current + 1 : 1
  return `DTE-01-${TEST_ESTABLISHMENT_CODE}${TEST_POINT_OF_SALE_CODE}-${padSequence(next)}`
}

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export async function createTestDteDraft({ request, supabase }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para crear un borrador DTE.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

  const { companyId, description, quantity = 1, unitPrice, totalLetras } = request.body || {}
  if (!companyId || !description || !unitPrice || !totalLetras) {
    const error = new Error('Faltan datos obligatorios para crear el DTE-01 de prueba.')
    error.statusCode = 400
    throw error
  }

  const numericQuantity = Number(quantity)
  const numericUnitPrice = Number(unitPrice)
  if (!(numericQuantity > 0) || !(numericUnitPrice > 0)) {
    const error = new Error('Cantidad y precio deben ser mayores que cero.')
    error.statusCode = 400
    throw error
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para crear DTE de esta empresa.')
    error.statusCode = 403
    throw error
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (companyError) throw companyError

  const { data: lastDocument, error: lastError } = await supabase
    .from('dte_documents')
    .select('control_number')
    .eq('company_id', companyId)
    .eq('dte_type', '01')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastError) throw lastError

  const controlNumber = nextControlNumber(lastDocument?.control_number)
  const testCompany = {
    ...company,
    establishment_code: TEST_ESTABLISHMENT_CODE,
    point_of_sale_code: TEST_POINT_OF_SALE_CODE,
  }

  const dte = buildFacturaFromRecords({
    company: testCompany,
    numeroControl: controlNumber,
    totalLetras: String(totalLetras).trim(),
    observaciones: 'PRUEBA INTERNA IDEALO SV - NO TRANSMITIR A HACIENDA',
    items: [{
      descripcion: String(description).trim(),
      cantidad: numericQuantity,
      precioUni: numericUnitPrice,
    }],
  })

  const { data: document, error: insertError } = await supabase
    .from('dte_documents')
    .insert({
      company_id: companyId,
      dte_type: '01',
      generation_code: dte.identificacion.codigoGeneracion,
      control_number: dte.identificacion.numeroControl,
      environment: 'test',
      status: 'DRAFT',
      dte_payload: dte,
      created_by: userData.user.id,
    })
    .select('id, generation_code, control_number, environment, status, created_at, dte_payload')
    .single()

  if (insertError) throw insertError

  return {
    ...document,
    transmissionAttempts: 0,
    signingPrepared: true,
    transmissionAllowed: false,
    testCodes: {
      establishment: TEST_ESTABLISHMENT_CODE,
      pointOfSale: TEST_POINT_OF_SALE_CODE,
      persistedToCompany: false,
    },
  }
}

export const __test__ = { nextControlNumber }
