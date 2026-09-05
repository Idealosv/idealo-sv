import { randomUUID } from 'node:crypto'
import { getDteConfig, getDteProductionPreflightStatus, getDteSignerConfig } from './config.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'
import { DteSignerClient } from './signer-client.js'
import { MhDteClient } from './mh-client.js'
import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'

const digits = value => String(value || '').replace(/\D/g, '')
const text = value => String(value || '').trim()
const upperUuid = value => String(value || '').trim().toUpperCase()
const pad = value => String(value).padStart(2, '0')
const localParts = (date = new Date()) => ({
  date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
})
const mhStatus = response => String(response?.body?.estado || response?.estado || response?.body?.status || response?.status || '').toUpperCase()
const mhMessage = response => {
  const value = response?.body || response || {}
  return [value.descripcionMsg, value.mensaje, value.message, value.descripcion, value.detalle].find(v => typeof v === 'string' && v.trim())?.trim() || ''
}
const signedDocument = response => {
  const value = response?.body || response
  const document = value?.documento || value?.document || value
  return typeof document === 'string' && document.trim() ? document.trim() : null
}
function conflict(message, code='DTE_EVENT_INVALID') { const e = new Error(message); e.statusCode = 409; e.code = code; return e }
function badRequest(message, code='DTE_EVENT_BAD_REQUEST') { const e = new Error(message); e.statusCode = 400; e.code = code; return e }

async function requireFiscalEventRole({ request, supabase, companyId, environment, operation }) {
  const user = await requireAuthenticatedUser({ request, supabase })
  await requireCompanyRole({
    supabase,
    companyId,
    userId: user.id,
    allowedRoles: environment === 'production' ? DTE_ROLES.TRANSMIT_PRODUCTION : DTE_ROLES.SIGN,
    operation,
  })
  if (environment === 'production') {
    const companyEnv = await buildCompanyDteEnv({ companyId, supabase })
    const preflight = getDteProductionPreflightStatus(companyEnv)
    if (!preflight.configurationReady) throw conflict(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers || []).join(' ')}`, 'DTE_PRODUCTION_BLOCKED')
  }
  return user
}

async function companyForEvent(supabase, companyId) {
  const { data, error } = await supabase.from('companies')
    .select('id,nit,name,trade_name,establishment_type,establishment_code,point_of_sale_code,mh_establishment_code,mh_point_of_sale_code,phone,email,demo_mode')
    .eq('id', companyId).single()
  if (error) throw error
  return data
}

async function assertFinancialInvalidationReady(supabase, document) {
  if (document.environment !== 'production') return
  const { data: receivables, error: arError } = await supabase.from('accounts_receivable').select('id,amount_paid,status').eq('dte_document_id', document.id)
  if (arError) throw arError
  for (const ar of receivables || []) {
    if (Number(ar.amount_paid || 0) > 0) throw conflict('Primero debes revertir los cobros aplicados a la cuenta por cobrar antes de invalidar el DTE.', 'DTE_FINANCIAL_PENDING')
    const { data: payments, error: pError } = await supabase.from('customer_payments').select('id').eq('receivable_id', ar.id)
    if (pError) throw pError
    for (const p of payments || []) {
      const { data: reversal, error: rError } = await supabase.from('customer_payment_reversals').select('id').eq('payment_id', p.id).maybeSingle()
      if (rError) throw rError
      if (!reversal) throw conflict('Existe un cobro sin reversión asociado al DTE.', 'DTE_FINANCIAL_PENDING')
    }
  }
  const { data: direct, error: dError } = await supabase.from('cash_movements').select('id').eq('company_id', document.company_id).eq('source_type','CUSTOMER_PAYMENT').eq('source_id',document.id)
  if (dError) throw dError
  if ((direct || []).length) {
    const { data: rev, error: revError } = await supabase.from('cash_movements').select('id').eq('company_id', document.company_id).eq('source_type','CUSTOMER_PAYMENT_REVERSAL').eq('source_id',document.id)
    if (revError) throw revError
    if (!(rev || []).length) throw conflict('Primero debes revertir el cobro directo del DTE antes de invalidarlo.', 'DTE_FINANCIAL_PENDING')
  }
}

function buildInvalidationPayload({ document, company, eventGenerationCode, reasonType, reason, responsible, requester, replacement }) {
  const now = localParts()
  const issued = document.dte_payload?.identificacion || {}
  const receiver = document.dte_payload?.receptor || {}
  const amountIva = Number(document.dte_payload?.resumen?.totalIva || document.dte_payload?.resumen?.tributos?.find?.(t => t?.codigo === '20')?.valor || 0)
  return {
    identificacion: { version: 2, ambiente: document.environment === 'production' ? '01' : '00', codigoGeneracion: eventGenerationCode, fecAnula: now.date, horAnula: now.time },
    emisor: {
      nit: digits(company.nit), nombre: text(company.name), tipoEstablecimiento: text(company.establishment_type || '02'), nomEstablecimiento: text(company.trade_name || company.name),
      codEstableMH: text(company.mh_establishment_code) || null, codEstable: text(company.establishment_code) || null,
      codPuntoVentaMH: text(company.mh_point_of_sale_code) || null, codPuntoVenta: text(company.point_of_sale_code) || null,
      telefono: digits(company.phone), correo: text(company.email).toLowerCase(),
    },
    documento: {
      tipoDte: String(document.dte_type), codigoGeneracion: upperUuid(document.generation_code), selloRecibido: text(document.mh_receipt_seal), numeroControl: text(document.control_number),
      fecEmi: text(issued.fecEmi), montoIva: Number(amountIva.toFixed(2)), codigoGeneracionR: replacement ? upperUuid(replacement.generation_code) : null,
      tipoDocumento: receiver.tipoDocumento || (receiver.nit ? '36' : null), numDocumento: receiver.numDocumento || receiver.nit || null, nombre: receiver.nombre || null,
    },
    motivo: {
      tipoAnulacion: Number(reasonType), motivoAnulacion: text(reason), nombreResponsable: text(responsible.name), tipDocResponsable: text(responsible.documentType), numDocResponsable: text(responsible.documentNumber),
      nombreSolicita: text(requester.name), tipDocSolicita: text(requester.documentType), numDocSolicita: text(requester.documentNumber),
    },
  }
}

export async function invalidateProcessedDte({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const { documentId, tipoAnulacion, motivoAnulacion, responsable, solicitante, replacementDocumentId = null, confirmation } = request.body || {}
  if (!documentId || ![1,2,3].includes(Number(tipoAnulacion)) || !text(motivoAnulacion)) throw badRequest('Faltan datos obligatorios para el evento de invalidación.')
  if (!responsable?.name || !responsable?.documentType || !responsable?.documentNumber || !solicitante?.name || !solicitante?.documentType || !solicitante?.documentNumber) throw badRequest('Responsable y solicitante son obligatorios para invalidar el DTE.')
  const { data: document, error } = await supabase.from('dte_documents').select('*').eq('id', documentId).single()
  if (error) throw error
  if (document.status !== 'PROCESSED') throw conflict('Solo se puede invalidar un DTE aceptado por Hacienda.', 'DTE_NOT_PROCESSED')
  if (!document.mh_receipt_seal) throw conflict('El DTE no tiene sello de recepción de Hacienda.', 'DTE_MH_SEAL_REQUIRED')
  const user = await requireFiscalEventRole({ request, supabase, companyId: document.company_id, environment: document.environment, operation: 'invalidar un DTE aceptado por Hacienda' })
  const expected = `INVALIDAR ${document.control_number}`
  if (confirmation !== expected) throw conflict(`Confirmación inválida. Debes confirmar exactamente: ${expected}`, 'DTE_CONFIRMATION_REQUIRED')
  await assertFinancialInvalidationReady(supabase, document)

  let replacement = null
  if (Number(tipoAnulacion) !== 2) {
    if (!replacementDocumentId) throw conflict('Los tipos de invalidación 1 y 3 requieren un DTE de reemplazo ya aceptado por Hacienda.', 'DTE_REPLACEMENT_REQUIRED')
    const { data, error: replacementError } = await supabase.from('dte_documents').select('id,company_id,environment,status,generation_code').eq('id', replacementDocumentId).single()
    if (replacementError) throw replacementError
    if (data.company_id !== document.company_id || data.environment !== document.environment || data.status !== 'PROCESSED') throw conflict('El DTE de reemplazo debe pertenecer a la misma empresa/ambiente y estar PROCESSED.', 'DTE_REPLACEMENT_INVALID')
    replacement = data
  }
  const company = await companyForEvent(supabase, document.company_id)
  if (document.environment === 'production' && company.demo_mode) throw conflict('ENTORNO DEMO: invalidación DTE de PRODUCCIÓN bloqueada.', 'DEMO_PRODUCTION_BLOCKED')
  const eventGenerationCode = randomUUID().toUpperCase()
  const payload = buildInvalidationPayload({ document, company, eventGenerationCode, reasonType: tipoAnulacion, reason: motivoAnulacion, responsible: responsable, requester: solicitante, replacement })
  const { data: existing } = await supabase.from('dte_fiscal_events').select('id,status').eq('dte_document_id',document.id).eq('event_type','INVALIDATION').maybeSingle()
  if (existing && existing.status === 'PROCESSED') return { eventId: existing.id, status: existing.status, alreadyProcessed: true }
  if (existing) throw conflict(`Ya existe un evento de invalidación para este DTE en estado ${existing.status}.`, 'DTE_INVALIDATION_EXISTS')
  const { data: event, error: eventError } = await supabase.from('dte_fiscal_events').insert({ company_id:document.company_id,dte_document_id:document.id,event_type:'INVALIDATION',environment:document.environment,generation_code:eventGenerationCode,status:'DRAFT',payload,created_by:user.id }).select('*').single()
  if (eventError) throw eventError

  const companyEnv = document.environment === 'production' ? await buildCompanyDteEnv({ companyId:document.company_id,supabase,env }) : { ...env, DTE_ENVIRONMENT:'test' }
  const signer = new DteSignerClient(getDteSignerConfig(companyEnv), { fetchImpl })
  const signedResponse = await signer.sign(payload)
  const signed = signedDocument(signedResponse)
  if (!signed) throw conflict('El firmador no devolvió el JWS del evento de invalidación.', 'DTE_EVENT_SIGN_FAILED')
  await supabase.from('dte_fiscal_events').update({status:'SIGNED',signed_document:signed,updated_at:new Date().toISOString()}).eq('id',event.id)
  const config = getDteConfig(companyEnv)
  const mh = new MhDteClient(config,{fetchImpl})
  const requestPayload = { ambiente: document.environment === 'production' ? '01' : '00', idEnvio: 1, version: 2, documento: signed }
  const { data: attempt, error: attemptError } = await supabase.from('dte_fiscal_event_attempts').insert({event_id:event.id,attempt_number:1,request_payload:requestPayload}).select('id').single()
  if (attemptError) throw attemptError
  await supabase.from('dte_fiscal_events').update({status:'TRANSMITTING',updated_at:new Date().toISOString()}).eq('id',event.id)
  try {
    await mh.authenticate()
    const response = await mh.invalidate(requestPayload)
    const processed = mhStatus(response) === 'PROCESADO'
    const now = new Date().toISOString()
    await supabase.from('dte_fiscal_event_attempts').update({response_payload:response,finished_at:now}).eq('id',attempt.id)
    await supabase.from('dte_fiscal_events').update({status:processed?'PROCESSED':'REJECTED',mh_response:response,mh_message:mhMessage(response),processed_at:processed?now:null,updated_at:now}).eq('id',event.id)
    if (processed) {
      const { error: documentUpdateError } = await supabase.from('dte_documents').update({status:'INVALIDATED',updated_at:now}).eq('id',document.id).eq('status','PROCESSED')
      if (documentUpdateError) throw documentUpdateError
    }
    return { eventId:event.id, status:processed?'PROCESSED':'REJECTED', mhResponse:response, documentStatus:processed?'INVALIDATED':document.status }
  } catch (e) {
    const now = new Date().toISOString()
    await supabase.from('dte_fiscal_event_attempts').update({error_message:e.message,finished_at:now}).eq('id',attempt.id)
    await supabase.from('dte_fiscal_events').update({status:'TRANSMISSION_UNKNOWN',mh_message:e.message,updated_at:now}).eq('id',event.id)
    throw e
  }
}

function buildContingencyPayload({ company, environment, generationCode, documents, startAt, endAt, contingencyType, reason, responsible }) {
  const sent = localParts()
  const start = localParts(new Date(startAt)); const end = localParts(new Date(endAt))
  return {
    identificacion: { version: 3, ambiente: environment === 'production' ? '01' : '00', codigoGeneracion: generationCode, fTransmision: sent.date, hTransmision: sent.time },
    emisor: { nit:digits(company.nit), nombre:text(company.name), nombreResponsable:text(responsible.name), tipoDocResponsable:text(responsible.documentType), numeroDocResponsable:text(responsible.documentNumber), tipoEstablecimiento:text(company.establishment_type || '02'), codEstableMH:text(company.mh_establishment_code)||null, codPuntoVenta:text(company.point_of_sale_code)||null, telefono:digits(company.phone), correo:text(company.email).toLowerCase() },
    detalleDTE: documents.map(d => ({ codigoGeneracion:upperUuid(d.generation_code), tipoDoc:String(d.dte_type) })),
    motivo: { fInicio:start.date,hInicio:start.time,fFin:end.date,hFin:end.time,tipoContingencia:Number(contingencyType),motivoContingencia:text(reason) },
  }
}

export async function reportDteContingency({ request, supabase, env = process.env, fetchImpl = fetch }) {
  const { companyId, documentIds, startAt, endAt, tipoContingencia, motivoContingencia, responsable, confirmation } = request.body || {}
  if (!companyId || !Array.isArray(documentIds) || documentIds.length < 1 || documentIds.length > 5000) throw badRequest('El evento de contingencia requiere entre 1 y 5000 DTE.')
  if (!startAt || !endAt || !tipoContingencia || !text(motivoContingencia) || !responsable?.name || !responsable?.documentType || !responsable?.documentNumber) throw badRequest('Faltan datos obligatorios del evento de contingencia.')
  const { data: documents, error } = await supabase.from('dte_documents').select('id,company_id,dte_type,generation_code,environment,status,dte_payload,signed_document').in('id',documentIds)
  if (error) throw error
  if ((documents || []).length !== documentIds.length) throw badRequest('Uno o más DTE de contingencia no existen.')
  const environment = documents[0]?.environment
  if ((documents || []).some(d => d.company_id !== companyId || d.environment !== environment)) throw conflict('Todos los DTE deben pertenecer a la misma empresa y ambiente.', 'DTE_CONTINGENCY_MIXED_SCOPE')
  if ((documents || []).some(d => !d.signed_document || Number(d.dte_payload?.identificacion?.tipoModelo) !== 2 || Number(d.dte_payload?.identificacion?.tipoOperacion) !== 2 || !d.dte_payload?.identificacion?.tipoContingencia)) throw conflict('Todos los DTE deben estar firmados y haber sido generados explícitamente en modelo/tipo de operación de contingencia.', 'DTE_CONTINGENCY_DOCUMENT_INVALID')
  const user = await requireFiscalEventRole({request,supabase,companyId,environment,operation:'reportar un evento de contingencia DTE'})
  const expected=`REPORTAR CONTINGENCIA ${documentIds.length} DTE`
  if(confirmation!==expected) throw conflict(`Confirmación inválida. Debes confirmar exactamente: ${expected}`,'DTE_CONFIRMATION_REQUIRED')
  const company=await companyForEvent(supabase,companyId)
  if(environment==='production'&&company.demo_mode) throw conflict('ENTORNO DEMO: contingencia DTE de PRODUCCIÓN bloqueada.','DEMO_PRODUCTION_BLOCKED')
  const generationCode=randomUUID().toUpperCase()
  const payload=buildContingencyPayload({company,environment,generationCode,documents,startAt,endAt,contingencyType:tipoContingencia,reason:motivoContingencia,responsible:responsable})
  const {data:event,error:eventError}=await supabase.from('dte_fiscal_events').insert({company_id:companyId,event_type:'CONTINGENCY',environment,generation_code:generationCode,status:'DRAFT',payload,created_by:user.id}).select('*').single()
  if(eventError)throw eventError
  const companyEnv=environment==='production'?await buildCompanyDteEnv({companyId,supabase,env}):{...env,DTE_ENVIRONMENT:'test'}
  const signer=new DteSignerClient(getDteSignerConfig(companyEnv),{fetchImpl});const signedResponse=await signer.sign(payload);const signed=signedDocument(signedResponse)
  if(!signed)throw conflict('El firmador no devolvió el JWS del evento de contingencia.','DTE_EVENT_SIGN_FAILED')
  await supabase.from('dte_fiscal_events').update({status:'SIGNED',signed_document:signed,updated_at:new Date().toISOString()}).eq('id',event.id)
  const requestPayload={ambiente:environment==='production'?'01':'00',idEnvio:1,version:3,documento:signed}
  const {data:attempt,error:attemptError}=await supabase.from('dte_fiscal_event_attempts').insert({event_id:event.id,attempt_number:1,request_payload:requestPayload}).select('id').single();if(attemptError)throw attemptError
  await supabase.from('dte_fiscal_events').update({status:'TRANSMITTING',updated_at:new Date().toISOString()}).eq('id',event.id)
  try{const mh=new MhDteClient(getDteConfig(companyEnv),{fetchImpl});await mh.authenticate();const response=await mh.reportContingency(requestPayload);const processed=mhStatus(response)==='PROCESADO';const now=new Date().toISOString();await supabase.from('dte_fiscal_event_attempts').update({response_payload:response,finished_at:now}).eq('id',attempt.id);await supabase.from('dte_fiscal_events').update({status:processed?'PROCESSED':'REJECTED',mh_response:response,mh_message:mhMessage(response),processed_at:processed?now:null,updated_at:now}).eq('id',event.id);return{eventId:event.id,status:processed?'PROCESSED':'REJECTED',mhResponse:response,documentsReported:documents.length,batchTransmissionRequired:processed}}
  catch(e){const now=new Date().toISOString();await supabase.from('dte_fiscal_event_attempts').update({error_message:e.message,finished_at:now}).eq('id',attempt.id);await supabase.from('dte_fiscal_events').update({status:'TRANSMISSION_UNKNOWN',mh_message:e.message,updated_at:now}).eq('id',event.id);throw e}
}

export const __test__={buildInvalidationPayload,buildContingencyPayload}
