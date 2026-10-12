import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { requireAuthenticatedUser, requireCompanyRole, DTE_ROLES } from './access-control.js'
import { sampleFromSchema } from './certification-document-service.js'

const TYPES = Object.freeze({
  RETURN: { type:'18', file:'EVT-RETORNO-v1.json', name:'Evento de Retorno' },
  SPECIAL_OPERATIONS: { type:'17', file:'EVT-OPERACIONES-ESPECIALES-v1.json', name:'Evento de Operaciones Especiales' },
})
const ajv = new Ajv({ allErrors:true, strict:false })
addFormats(ajv)
const schemas = new Map()
const digits = value => String(value || '').replace(/\D/g, '')
function bad(message, code = 'DTE_EVENT_CERTIFICATION_INVALID', statusCode = 400) {
  const error = new Error(message);error.code = code;error.statusCode = statusCode;throw error
}
export function eventSchemaFor(type) {
  const entry = TYPES[type]
  if (!entry) bad('Tipo de evento adicional no soportado.')
  if (!schemas.has(type)) {
    const schema = JSON.parse(readFileSync(new URL('./schemas/'+entry.file,import.meta.url),'utf8'))
    if (schema.properties?.identificacion?.properties?.tipoEvento?.const !== entry.type) bad('El esquema de evento no corresponde al tipo seleccionado.', 'DTE_EVENT_SCHEMA_MISMATCH', 500)
    schemas.set(type,{schema,validate:ajv.compile(schema)})
  }
  return schemas.get(type)
}
function stamp() {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date()).map(p=>[p.type,p.value]))
  return {date:[parts.year,parts.month,parts.day].join('-'),time:[parts.hour,parts.minute,parts.second].join(':')}
}
export function eventTemplate({ eventType, company }) {
  const { schema } = eventSchemaFor(eventType)
  const result = sampleFromSchema(schema)
  const id = result.identificacion || {}
  const issued = stamp()
  Object.assign(id,{
    version:1, ambiente:'00',tipoModelo:1,tipoOperacion:1,
    tipoEvento:TYPES[eventType].type,codigoGeneracion:randomUUID().toUpperCase(),
    fecEmi:issued.date,horEmi:issued.time,tipoMoneda:'USD',
  })
  if (Object.hasOwn(id,'tipoContingencia')) id.tipoContingencia = null
  if (Object.hasOwn(id,'motivoContin')) id.motivoContin = null
  const emisor = sampleFromSchema({ ...schema.properties.emisor, type:'object' }) || {}
  result.emisor = {
    ...emisor,
    nit:digits(company.nit),nombre:String(company.name||'').trim(),
  }
  if(Object.hasOwn(emisor,'codEstableMH')) result.emisor.codEstableMH='M001'
  if(Object.hasOwn(emisor,'codEstable')) result.emisor.codEstable='M001'
  if(Object.hasOwn(emisor,'codPuntoVentaMH')) result.emisor.codPuntoVentaMH='P001'
  if(Object.hasOwn(emisor,'codPuntoVenta')) result.emisor.codPuntoVenta='P001'
  return result
}
function verifyEventDocument(type,payload,company) {
  const { validate } = eventSchemaFor(type)
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) bad('Completa el JSON del evento.')
  if(payload.identificacion?.ambiente!=='00'||payload.identificacion?.tipoEvento!==TYPES[type].type||payload.identificacion?.version!==1)
    bad('El evento debe ser del tipo seleccionado en ambiente TEST.')
  if(payload.identificacion?.tipoModelo!==1||payload.identificacion?.tipoOperacion!==1)
    bad('Únicamente se admite un evento de operación normal, sin contingencia.')
  if(digits(payload.emisor?.nit)!==digits(company.nit)||!digits(company.nit))
    bad('El NIT emisor debe coincidir con la empresa activa.')
  if(!validate(payload)) bad('Esquema MH inválido: '+(validate.errors||[]).slice(0,10).map(e=>(e.instancePath||'raíz')+': '+e.message).join(' | '),'DTE_EVENT_SCHEMA_INVALID')
}
async function secure({request,supabase,companyId}) {
  const user=await requireAuthenticatedUser({request,supabase})
  if(!companyId) bad('Selecciona una empresa.')
  await requireCompanyRole({supabase,companyId,userId:user.id,allowedRoles:DTE_ROLES.DRAFT,operation:'preparar eventos de certificación MH'})
  const {data:company,error}=await supabase.from('companies').select('*').eq('id',companyId).single()
  if(error)throw error
  if(!digits(company.nit))bad('Falta el NIT del emisor.')
  return {user,company}
}
async function validateRelatedDte({supabase,companyId,eventType,sourceDocumentId,document}) {
  if(eventType!=='RETURN') return null
  if(!sourceDocumentId) bad('Retorno: selecciona el DTE anterior aceptado.')
  const { data, error }=await supabase.from('dte_documents')
    .select('id,dte_type,generation_code,status,environment,company_id')
    .eq('id',sourceDocumentId).eq('company_id',companyId).eq('environment','test').single()
  if(error)throw error
  if(!['01','11','14'].includes(data.dte_type)||!['PROCESSED','INVALIDATED'].includes(data.status))
    bad('El evento de retorno necesita un DTE-01, 11 o 14 previamente aceptado en TEST.')
  const related=Array.isArray(document.documentoRelacionado)?document.documentoRelacionado:[]
  if(!related.some(row=>String(row.codigoGeneracion||'').toUpperCase()===String(data.generation_code).toUpperCase()&&row.tipoDocumento===data.dte_type))
    bad('El evento de retorno debe relacionar el mismo DTE seleccionado del ERP.')
  return data
}
export async function getAdditionalEventTemplate({request,supabase}) {
  const companyId=String(request.query?.companyId||'').trim(),eventType=String(request.query?.eventType||'')
  const { company }=await secure({request,supabase,companyId})
  return { eventType,name:TYPES[eventType]?.name,document:eventTemplate({eventType,company}),transmissionAvailable:false,reason:'Autorización y endpoint oficial de eventos pendientes de verificar.' }
}
export async function validateAdditionalEvent({request,supabase}) {
  const {companyId,eventType,document,sourceDocumentId}=request.body||{}
  const {company}=await secure({request,supabase,companyId})
  verifyEventDocument(eventType,document,company)
  await validateRelatedDte({supabase,companyId,eventType,sourceDocumentId,document})
  return {valid:true,transmissionAvailable:false,environment:'test'}
}
export async function createAdditionalEventDraft({request,supabase}) {
  const {companyId,eventType,document,sourceDocumentId}=request.body||{}
  const {user,company}=await secure({request,supabase,companyId})
  if(!TYPES[eventType])bad('Tipo de evento desconocido.')
  if(JSON.stringify(document||{}).length>750000)bad('El documento excede el tamaño permitido.')
  const data=structuredClone(document)
  const id=data.identificacion
  if(!id||!data.emisor)bad('Evento sin emisor o identificación.')
  const issued=stamp()
  Object.assign(id,{
    ambiente:'00',version:1,tipoEvento:TYPES[eventType].type,
    codigoGeneracion:randomUUID().toUpperCase(),
    fecEmi:issued.date,horEmi:issued.time,tipoModelo:1,tipoOperacion:1,tipoMoneda:'USD',
  })
  verifyEventDocument(eventType,data,company)
  const source=await validateRelatedDte({supabase,companyId,eventType,sourceDocumentId,document:data})
  const {data:row,error}=await supabase.from('dte_fiscal_events').insert({
    company_id:companyId,event_type:eventType,environment:'test',status:'DRAFT',
    dte_document_id:source?.id||null,generation_code:id.codigoGeneracion,payload:data,created_by:user.id,
  }).select('id,event_type,environment,status,generation_code').single()
  if(error)throw error
  return {...row,transmissionAvailable:false,transmitted:false}
}
