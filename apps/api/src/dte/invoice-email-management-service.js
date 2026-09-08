import nodemailer from 'nodemailer'
import { buildInvoiceEmailWithPdf, invoiceRecipient } from './invoice-email-service.js'

const text=(value)=>String(value??'').trim()

function bearerToken(request){const authorization=request.headers.authorization||'';return authorization.startsWith('Bearer ')?authorization.slice(7).trim():''}
function receiptSeal(response){const body=response?.body||response||{};return text(body.selloRecibido||body.selloRecepcion||body.sello||'')}
function gmailConfig(env){return{user:text(env.GMAIL_SMTP_USER).toLowerCase(),appPassword:text(env.GMAIL_APP_PASSWORD).replace(/\s+/g,''),fromName:text(env.GMAIL_FROM_NAME||'IDEALO SV - Facturación')}}

async function authorizedUser({request,supabase}){
  const token=bearerToken(request)
  if(!token){const error=new Error('Debes iniciar sesión.');error.statusCode=401;throw error}
  const {data,error}=await supabase.auth.getUser(token)
  if(error||!data?.user){const authError=new Error('La sesión no es válida o ya venció.');authError.statusCode=401;throw authError}
  return data.user
}

async function loadAuthorizedDocument({request,supabase}){
  const user=await authorizedUser({request,supabase})
  const documentId=text(request.body?.documentId||request.query?.documentId)
  if(!documentId){const error=new Error('Debes seleccionar un DTE.');error.statusCode=400;throw error}
  const {data:document,error:documentError}=await supabase.from('dte_documents').select('id,company_id,dte_type,control_number,generation_code,environment,status,dte_payload,signed_document,mh_response').eq('id',documentId).maybeSingle()
  if(documentError)throw documentError
  if(!document){const error=new Error('No se encontró el DTE.');error.statusCode=404;throw error}
  const {data:membership,error:membershipError}=await supabase.from('company_members').select('role').eq('company_id',document.company_id).eq('user_id',user.id).maybeSingle()
  if(membershipError)throw membershipError
  if(!membership){const error=new Error('No tienes permiso para usar este DTE.');error.statusCode=403;throw error}
  return document
}

export async function getInvoiceEmailStatus({request,supabase}){
  const document=await loadAuthorizedDocument({request,supabase})
  const base={
    documentId:document.id,
    controlNumber:document.control_number,
    recipient:invoiceRecipient(document)||null,
    eligible:document.environment==='production'&&document.status==='PROCESSED'&&Boolean(receiptSeal(document.mh_response)),
  }
  try{
    const {data,error}=await supabase.from('invoice_email_deliveries').select('id,recipient_email,delivery_kind,status,provider_message_id,error_message,sent_at,created_at,updated_at').eq('dte_document_id',document.id).order('created_at',{ascending:false}).limit(20)
    if(error)throw error
    const deliveries=data||[]
    return{...base,trackingAvailable:true,trackingError:null,latest:deliveries[0]||null,deliveries}
  }catch(error){
    console.error('INVOICE_EMAIL_STATUS_HISTORY_FAILED',{documentId:document.id,code:error?.code,message:error?.message})
    return{...base,trackingAvailable:false,trackingError:'No se pudo consultar temporalmente el historial de entregas.',latest:null,deliveries:[]}
  }
}

export async function resendInvoiceEmail({request,supabase,env=process.env,transporterFactory}){
  const document=await loadAuthorizedDocument({request,supabase})
  if(document.environment!=='production'||document.status!=='PROCESSED'||!receiptSeal(document.mh_response)){
    const error=new Error('Solo se puede reenviar un DTE de PRODUCCIÓN aceptado por Hacienda y con sello de recepción.');error.statusCode=409;throw error
  }
  const recipient=invoiceRecipient(document)
  if(!recipient){const error=new Error('El receptor no tiene correo electrónico registrado.');error.statusCode=409;throw error}
  const config=gmailConfig(env)
  if(!config.user||!config.appPassword){const error=new Error('Gmail no está configurado en el backend.');error.statusCode=503;throw error}

  const {data:delivery,error:createError}=await supabase.from('invoice_email_deliveries').insert({dte_document_id:document.id,company_id:document.company_id,recipient_email:recipient,delivery_kind:'manual',status:'pending'}).select('id').single()
  if(createError)throw createError
  const transporter=transporterFactory?transporterFactory(config):nodemailer.createTransport({service:'gmail',auth:{user:config.user,pass:config.appPassword},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000})
  try{
    const message=await buildInvoiceEmailWithPdf(document)
    const sent=await transporter.sendMail({from:{name:config.fromName,address:config.user},to:recipient,replyTo:config.user,subject:`Reenvío · ${message.subject}`,html:`<div style="max-width:680px;margin:0 auto 12px;padding:10px 14px;border-left:4px solid #f97316;background:#fff7ed;font-family:Arial,sans-serif;font-size:13px"><strong>Reenvío solicitado desde IDEALO SV</strong><br>Este reenvío no genera, firma ni transmite un nuevo DTE a Hacienda.</div>${message.html}`,attachments:message.attachments})
    const now=new Date().toISOString()
    await supabase.from('invoice_email_deliveries').update({status:'sent',provider_message_id:text(sent?.messageId)||null,sent_at:now,error_message:null,updated_at:now}).eq('id',delivery.id)
    return{ok:true,status:'sent',deliveryId:delivery.id,recipient,messageId:text(sent?.messageId)||null,sentAt:now,pdfAttached:true,transmittedToMh:false}
  }catch(error){
    const message=text(error?.message).slice(0,1000)||'No se pudo reenviar el correo.'
    await supabase.from('invoice_email_deliveries').update({status:'failed',error_message:message,updated_at:new Date().toISOString()}).eq('id',delivery.id)
    const sendError=new Error(message);sendError.statusCode=502;throw sendError
  }finally{if(!transporterFactory&&typeof transporter.close==='function')transporter.close()}
}
