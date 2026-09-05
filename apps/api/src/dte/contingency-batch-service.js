import { randomUUID } from 'node:crypto'
import { getDteConfig, getDteProductionPreflightStatus } from './config.js'
import { buildCompanyDteEnv } from './runtime-settings-service.js'
import { MhDteClient } from './mh-client.js'
import { DTE_ROLES, requireAuthenticatedUser, requireCompanyRole } from './access-control.js'

const digits = value => String(value || '').replace(/\D/g, '')
const text = value => String(value || '').trim()
function conflict(message, code='DTE_BATCH_INVALID'){const e=new Error(message);e.statusCode=409;e.code=code;return e}
function badRequest(message, code='DTE_BATCH_BAD_REQUEST'){const e=new Error(message);e.statusCode=400;e.code=code;return e}
const bodyOf = value => value?.body || value || {}
const responseState = value => String(bodyOf(value).estado || bodyOf(value).status || '').toUpperCase()
const lotCode = value => text(bodyOf(value).codigoLote || bodyOf(value).codigoGeneracion)

export function splitMhBatches(documents, max=100){
  if(!Array.isArray(documents)||documents.length<2) throw badRequest('La recepción por lote requiere al menos 2 DTE.')
  if(max<2||max>100) throw badRequest('El tamaño máximo de lote debe estar entre 2 y 100.')
  const count=Math.ceil(documents.length/max)
  const base=Math.floor(documents.length/count)
  const extra=documents.length%count
  const result=[];let offset=0
  for(let i=0;i<count;i++){const size=base+(i<extra?1:0);result.push(documents.slice(offset,offset+size));offset+=size}
  if(result.some(group=>group.length<2||group.length>100)) throw conflict('No se pudo distribuir los DTE en lotes válidos.','DTE_BATCH_SPLIT_FAILED')
  return result
}

export function buildContingencyBatchPayload({environment,nit,requestId,documents}){
  if(!Array.isArray(documents)||documents.length<2||documents.length>100) throw badRequest('Cada lote MH debe contener entre 2 y 100 DTE.')
  const issuerNit=digits(nit)
  if(issuerNit.length!==14) throw badRequest('El NIT del emisor debe contener 14 dígitos para recepción por lote.')
  return {
    version:1,
    ambiente:environment==='production'?'01':'00',
    idEnvio:String(requestId||randomUUID()).toUpperCase(),
    nitEmisor:issuerNit,
    documentos:documents.map(document=>({codigoGeneracion:String(document.generation_code).toUpperCase(),documento:document.signed_document})),
  }
}

async function requireBatchRole({request,supabase,companyId,environment}){
  const user=await requireAuthenticatedUser({request,supabase})
  await requireCompanyRole({supabase,companyId,userId:user.id,allowedRoles:environment==='production'?DTE_ROLES.TRANSMIT_PRODUCTION:DTE_ROLES.TRANSMIT_TEST,operation:'transmitir y conciliar lotes DTE de contingencia'})
  if(environment==='production'){
    const companyEnv=await buildCompanyDteEnv({companyId,supabase})
    const preflight=getDteProductionPreflightStatus(companyEnv)
    if(!preflight.configurationReady) throw conflict(`PRODUCCIÓN continúa bloqueada: ${(preflight.blockers||[]).join(' ')}`,'DTE_PRODUCTION_BLOCKED')
  }
  return user
}

async function eventContext({supabase,eventId}){
  const {data:event,error}=await supabase.from('dte_fiscal_events').select('*').eq('id',eventId).eq('event_type','CONTINGENCY').single();if(error)throw error
  if(event.status!=='PROCESSED') throw conflict('El evento de contingencia debe estar PROCESSED por Hacienda antes de enviar sus DTE.','DTE_CONTINGENCY_NOT_PROCESSED')
  const codes=(event.payload?.detalleDTE||[]).map(row=>String(row.codigoGeneracion||'').toUpperCase()).filter(Boolean)
  if(codes.length<2) throw conflict('La recepción por lote requiere al menos 2 DTE reportados en el evento de contingencia.','DTE_BATCH_MINIMUM')
  const {data:documents,error:documentsError}=await supabase.from('dte_documents').select('id,company_id,dte_type,generation_code,environment,status,dte_payload,signed_document').eq('company_id',event.company_id).in('generation_code',codes);if(documentsError)throw documentsError
  if((documents||[]).length!==codes.length) throw conflict('No se localizaron todos los DTE del evento de contingencia.','DTE_BATCH_DOCUMENTS_MISSING')
  if(documents.some(d=>d.environment!==event.environment||!d.signed_document||Number(d.dte_payload?.identificacion?.tipoModelo)!==2||Number(d.dte_payload?.identificacion?.tipoOperacion)!==2)) throw conflict('Uno o más DTE ya no cumplen las condiciones de contingencia firmada.','DTE_BATCH_DOCUMENT_INVALID')
  return {event,documents}
}

export async function transmitContingencyBatches({request,supabase,env=process.env,fetchImpl=fetch}){
  const {eventId,confirmation}=request.body||{}
  if(!eventId) throw badRequest('Debes indicar el evento de contingencia.')
  const {event,documents}=await eventContext({supabase,eventId})
  const user=await requireBatchRole({request,supabase,companyId:event.company_id,environment:event.environment})
  const expected=`TRANSMITIR LOTES CONTINGENCIA ${documents.length} DTE`
  if(confirmation!==expected) throw conflict(`Confirmación inválida. Debes confirmar exactamente: ${expected}`,'DTE_CONFIRMATION_REQUIRED')
  const {data:company,error:companyError}=await supabase.from('companies').select('nit,demo_mode').eq('id',event.company_id).single();if(companyError)throw companyError
  if(event.environment==='production'&&company.demo_mode) throw conflict('ENTORNO DEMO: transmisión de lotes DTE de PRODUCCIÓN bloqueada.','DEMO_PRODUCTION_BLOCKED')
  const groups=splitMhBatches(documents,100)
  if(groups.length>400) throw conflict('El evento excede el máximo operativo de 400 lotes.','DTE_BATCH_LIMIT')
  const companyEnv=event.environment==='production'?await buildCompanyDteEnv({companyId:event.company_id,supabase,env}):{...env,DTE_ENVIRONMENT:'test'}
  const mh=new MhDteClient(getDteConfig(companyEnv),{fetchImpl});await mh.authenticate()
  const results=[]
  for(let index=0;index<groups.length;index++){
    const batchNumber=index+1
    const {data:existing,error:existingError}=await supabase.from('dte_contingency_batches').select('*').eq('event_id',event.id).eq('batch_number',batchNumber).maybeSingle();if(existingError)throw existingError
    if(existing?.codigo_lote){results.push({batchNumber,status:existing.status,codigoLote:existing.codigo_lote,alreadySubmitted:true});continue}
    if(existing&&existing.status==='TRANSMISSION_UNKNOWN') throw conflict(`El lote ${batchNumber} tiene resultado incierto. Debe conciliarse antes de cualquier reenvío.`,'DTE_BATCH_UNKNOWN')
    const requestId=randomUUID().toUpperCase()
    const payload=buildContingencyBatchPayload({environment:event.environment,nit:company.nit,requestId,documents:groups[index]})
    const row=existing||((await supabase.from('dte_contingency_batches').insert({company_id:event.company_id,event_id:event.id,batch_number:batchNumber,request_id:requestId,environment:event.environment,status:'PENDING',document_ids:groups[index].map(d=>d.id),request_payload:payload,created_by:user.id}).select('*').single()).data)
    await supabase.from('dte_contingency_batches').update({status:'TRANSMITTING',updated_at:new Date().toISOString()}).eq('id',row.id)
    try{
      const response=await mh.receiveBatch(payload);const code=lotCode(response);const now=new Date().toISOString()
      if(!code) throw conflict('Hacienda no devolvió código de lote.','DTE_BATCH_CODE_MISSING')
      await supabase.from('dte_contingency_batches').update({status:'SUBMITTED',codigo_lote:code,mh_response:response,submitted_at:now,updated_at:now}).eq('id',row.id)
      results.push({batchNumber,status:'SUBMITTED',codigoLote:code,documents:groups[index].length})
    }catch(error){const now=new Date().toISOString();await supabase.from('dte_contingency_batches').update({status:'TRANSMISSION_UNKNOWN',error_message:error.message,updated_at:now}).eq('id',row.id);throw error}
  }
  return {eventId:event.id,documents:documents.length,batches:results,reconciliationRequired:true}
}

function extractBatchDetails(response){
  const value=bodyOf(response);const entries=Array.isArray(value.feDtes)?value.feDtes:[]
  return entries.map(entry=>entry?.detalleDte||entry?.detalleDTE||entry).filter(Boolean)
}

export async function reconcileContingencyBatches({request,supabase,env=process.env,fetchImpl=fetch}){
  const eventId=request.query?.eventId||request.body?.eventId
  if(!eventId) throw badRequest('Debes indicar el evento de contingencia.')
  const {event}=await eventContext({supabase,eventId})
  await requireBatchRole({request,supabase,companyId:event.company_id,environment:event.environment})
  const {data:batches,error}=await supabase.from('dte_contingency_batches').select('*').eq('event_id',event.id).order('batch_number');if(error)throw error
  if(!(batches||[]).length) throw conflict('Todavía no existen lotes enviados para este evento.','DTE_BATCHES_NOT_FOUND')
  const companyEnv=event.environment==='production'?await buildCompanyDteEnv({companyId:event.company_id,supabase,env}):{...env,DTE_ENVIRONMENT:'test'}
  const mh=new MhDteClient(getDteConfig(companyEnv),{fetchImpl});await mh.authenticate()
  const results=[]
  for(const batch of batches){
    if(!batch.codigo_lote){results.push({batchNumber:batch.batch_number,status:batch.status,reconciled:false});continue}
    const response=await mh.queryBatch(batch.codigo_lote);const value=bodyOf(response);const state=responseState(response);const details=extractBatchDetails(response);const now=new Date().toISOString()
    if(state!=='PROCESADO'){await supabase.from('dte_contingency_batches').update({status:state||'PENDING',query_response:response,updated_at:now}).eq('id',batch.id);results.push({batchNumber:batch.batch_number,status:state||'PENDING',reconciled:false});continue}
    for(const detail of details){
      const generationCode=String(detail.codigoGeneracion||'').toUpperCase();if(!generationCode)continue
      const processed=String(detail.estado||'').toUpperCase()==='PROCESADO'
      const update={status:processed?'PROCESSED':'REJECTED',mh_response:detail,updated_at:now}
      if(detail.selloRecibido) update.mh_receipt_seal=detail.selloRecibido
      if(detail.fhProcesamiento) update.mh_processed_at=now
      if(detail.codigoMsg) update.mh_message_code=String(detail.codigoMsg)
      if(detail.descripcionMsg) update.mh_message=String(detail.descripcionMsg)
      await supabase.from('dte_documents').update(update).eq('company_id',event.company_id).eq('generation_code',generationCode).in('status',['SIGNED','TRANSMITTING','TRANSMISSION_UNKNOWN','DRAFT'])
    }
    const rejected=details.filter(d=>String(d.estado||'').toUpperCase()!=='PROCESADO').length
    await supabase.from('dte_contingency_batches').update({status:rejected?'RECONCILED_WITH_REJECTIONS':'RECONCILED',query_response:response,reconciled_at:now,updated_at:now}).eq('id',batch.id)
    results.push({batchNumber:batch.batch_number,status:rejected?'RECONCILED_WITH_REJECTIONS':'RECONCILED',documents:details.length,rejected})
  }
  return {eventId:event.id,batches:results,complete:results.every(r=>String(r.status).startsWith('RECONCILED'))}
}

export const __test__={splitMhBatches,buildContingencyBatchPayload,extractBatchDetails}
