import nodemailer from 'nodemailer'

function httpError(message,statusCode=400,code='SAAS_NOTIFICATION_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
const text=value=>String(value??'').trim()
function bearer(request){const value=text(request.headers?.authorization);return value.startsWith('Bearer ')?value.slice(7).trim():''}
function admins(env){return new Set(text(env.IDEALO_PLATFORM_ADMIN_EMAILS).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
async function platformActor({request,supabase,env}){const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED');const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID');const configured=admins(env);if(!configured.size)throw httpError('El Panel Maestro no tiene administradores configurados.',503,'PLATFORM_ADMIN_NOT_CONFIGURED');if(!configured.has(text(user.email).toLowerCase()))throw httpError('Acceso reservado para administración de IDEALO.',403,'PLATFORM_ADMIN_REQUIRED');return user}
function gmailConfig(env){return{user:text(env.GMAIL_SMTP_USER).toLowerCase(),appPassword:text(env.GMAIL_APP_PASSWORD).replace(/\s+/g,''),fromName:text(env.GMAIL_FROM_NAME||'IDEALO SV')}}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value))}
function reminderCopy(type,dueAt){const due=dueAt?new Date(dueAt).toLocaleDateString('es-SV',{day:'2-digit',month:'long',year:'numeric'}):'la fecha indicada';const map={DUE_7:{subject:'Tu membresía IDEALO SV vence en 7 días',headline:'Tu membresía vence pronto',body:`La próxima fecha de renovación es ${due}.`},DUE_3:{subject:'Tu membresía IDEALO SV vence en 3 días',headline:'Faltan 3 días para la renovación',body:`La próxima fecha de renovación es ${due}.`},DUE_1:{subject:'Tu membresía IDEALO SV vence mañana',headline:'Tu membresía vence mañana',body:`La próxima fecha de renovación es ${due}.`},DUE_TODAY:{subject:'Tu membresía IDEALO SV vence hoy',headline:'Renovación pendiente hoy',body:`La membresía vence el ${due}.`},PAST_DUE:{subject:'Membresía IDEALO SV con pago pendiente',headline:'Tu membresía está vencida',body:'Existe una mensualidad pendiente. Durante el período de gracia algunas funciones pueden continuar disponibles.'},SUSPENDED:{subject:'Membresía IDEALO SV suspendida',headline:'Acceso suspendido por vencimiento',body:'La membresía se encuentra suspendida. Al registrar la renovación, el acceso puede ser reactivado.'}};return map[type]||{subject:'Aviso de membresía IDEALO SV',headline:'Aviso de membresía',body:`Revisá el estado de tu membresía con vencimiento ${due}.`}}
function buildMessage({companyName,type,dueAt}){const copy=reminderCopy(type,dueAt);return{subject:copy.subject,text:`${companyName}: ${copy.headline}. ${copy.body} Este aviso no realiza cobros automáticos.`,html:`<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717"><div style="max-width:640px;margin:24px auto;background:white;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden"><div style="background:#111;color:#fff;padding:20px 24px"><strong style="color:#ff6a00">IDEALO SV</strong><br><span>Gestión de membresía</span></div><div style="padding:24px"><h2 style="margin-top:0">${copy.headline}</h2><p><strong>${companyName}</strong></p><p>${copy.body}</p><p>Este aviso es informativo y no realiza cobros automáticos.</p><p style="font-size:12px;color:#666">Si el pago ya fue registrado, podés ignorar este mensaje.</p></div></div></body></html>`}}
async function ownerEmail({supabase,companyId}){const {data:member,error}=await supabase.from('company_members').select('user_id').eq('company_id',companyId).eq('role','owner').limit(1).maybeSingle();if(error)throw error;if(!member?.user_id)return null;const {data,error:userError}=await supabase.auth.admin.getUserById(member.user_id);if(userError)throw userError;return validEmail(data?.user?.email)?text(data.user.email).toLowerCase():null}

export async function dispatchPendingSaasReminders({request,supabase,env=process.env,transporterFactory}){
 const actor=await platformActor({request,supabase,env})
 const dryRun=request.body?.dry_run!==false
 const limit=Math.max(1,Math.min(50,Number(request.body?.limit||20)))
 const {data:reminders,error}=await supabase.from('saas_payment_reminders').select('id,company_id,subscription_id,reminder_type,due_at,status,sent_at').eq('status','pending').is('sent_at',null).order('due_at',{ascending:true}).limit(limit)
 if(error)throw error
 if(!(reminders||[]).length)return{ok:true,dry_run:dryRun,examined:0,sent:0,skipped:0,failed:0,results:[]}
 const companyIds=[...new Set(reminders.map(x=>x.company_id))]
 const {data:companies,error:companyError}=await supabase.from('companies').select('id,name,email,demo_mode').in('id',companyIds);if(companyError)throw companyError
 const companyMap=new Map((companies||[]).map(x=>[x.id,x]))
 const config=gmailConfig(env)
 if(!dryRun&&(!config.user||!config.appPassword))throw httpError('Gmail no está configurado para enviar avisos SaaS.',503,'GMAIL_NOT_CONFIGURED')
 const transporter=dryRun?null:(transporterFactory?transporterFactory(config):nodemailer.createTransport({service:'gmail',auth:{user:config.user,pass:config.appPassword},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000}))
 const results=[]
 try{
  for(const reminder of reminders){
   const company=companyMap.get(reminder.company_id)
   if(!company){results.push({id:reminder.id,status:'skipped',reason:'company_not_found'});continue}
   if(company.demo_mode){results.push({id:reminder.id,company:company.name,status:'skipped',reason:'demo_company'});continue}
   let recipient=validEmail(company.email)?text(company.email).toLowerCase():null
   if(!recipient)recipient=await ownerEmail({supabase,companyId:company.id})
   if(!recipient){results.push({id:reminder.id,company:company.name,status:'skipped',reason:'recipient_missing'});continue}
   if(dryRun){results.push({id:reminder.id,company:company.name,recipient,reminder_type:reminder.reminder_type,status:'ready'});continue}
   try{
    const message=buildMessage({companyName:company.name,type:reminder.reminder_type,dueAt:reminder.due_at})
    const sent=await transporter.sendMail({from:{name:config.fromName,address:config.user},to:recipient,replyTo:config.user,subject:message.subject,text:message.text,html:message.html})
    const now=new Date().toISOString()
    const {data:claimed,error:updateError}=await supabase.from('saas_payment_reminders').update({status:'sent',sent_at:now}).eq('id',reminder.id).eq('status','pending').is('sent_at',null).select('id').maybeSingle()
    if(updateError)throw updateError
    results.push({id:reminder.id,company:company.name,recipient,status:claimed?'sent':'already_processed',message_id:text(sent?.messageId)||null})
   }catch(sendError){results.push({id:reminder.id,company:company.name,recipient,status:'failed',reason:text(sendError?.message).slice(0,240)||'send_failed'})}
  }
 }finally{if(transporter&&!transporterFactory&&typeof transporter.close==='function')transporter.close()}
 const sent=results.filter(x=>x.status==='sent').length,failed=results.filter(x=>x.status==='failed').length,skipped=results.filter(x=>['skipped','already_processed'].includes(x.status)).length
 return{ok:failed===0,dry_run:dryRun,actor:actor.email,examined:reminders.length,sent,failed,skipped,results}
}

export const __test__={reminderCopy,buildMessage,validEmail}
