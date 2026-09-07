import {updateSaasSubscription} from './saas-master-service.js'
function httpError(message,statusCode=400,code='SAAS_SUBSCRIPTION_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
function admins(){return new Set(String(process.env.IDEALO_PLATFORM_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
async function assertAdmin({request,supabase}){const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED');const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID');if(!admins().has(String(user.email||'').toLowerCase()))throw httpError('Acceso reservado para administración de IDEALO.',403,'PLATFORM_ADMIN_REQUIRED');return user}
async function wasJustRenewedByMonthlyPayment({supabase,companyId}){const {data,error}=await supabase.from('saas_company_subscriptions').select('*').eq('company_id',companyId).maybeSingle();if(error)throw error;if(!data?.last_payment_at||!data?.current_period_end)return null;const paymentAge=Date.now()-new Date(data.last_payment_at).getTime();if(paymentAge<0||paymentAge>30000)return null;const {data:event,error:eventError}=await supabase.from('saas_billing_events').select('id,event_type,metadata,occurred_at').eq('company_id',companyId).eq('event_type','PAYMENT_RECORDED').order('occurred_at',{ascending:false}).limit(1).maybeSingle();if(eventError)throw eventError;if(!event||String(event.metadata?.charge_type||'')!=='monthly')return null;const eventAge=Date.now()-new Date(event.occurred_at).getTime();if(eventAge<0||eventAge>30000)return null;return data}
async function validatePlanAndUsage({supabase,companyId,planId}){const [{data:plan,error:planError},{count,error:countError}]=await Promise.all([supabase.from('saas_plans').select('id,name,max_users,active').eq('id',planId).maybeSingle(),supabase.from('company_members').select('*',{count:'exact',head:true}).eq('company_id',companyId)]);if(planError)throw planError;if(countError)throw countError;if(!plan?.active)throw httpError('El plan seleccionado no está disponible.',409,'PLAN_UNAVAILABLE');if(plan.max_users!=null&&Number(count||0)>Number(plan.max_users))throw httpError(`La empresa tiene ${count||0} usuarios y el plan ${plan.name} permite ${plan.max_users}. Reducí usuarios antes de cambiar el plan.`,409,'PLAN_USER_LIMIT_CONFLICT');return plan}

export async function assignLegacySubscription({request,supabase}){
 const actor=await assertAdmin({request,supabase})
 const companyId=String(request.params.companyId||'').trim(),planId=String(request.body?.plan_id||'').trim(),verticalId=String(request.body?.vertical_id||'').trim()
 if(!companyId||!planId||!verticalId)throw httpError('Empresa, plan y rubro son obligatorios.',400,'LEGACY_ASSIGNMENT_REQUIRED')
 if(String(request.body?.confirmation||'')!=='ASIGNAR PLAN A EMPRESA LEGACY')throw httpError('Confirmación inválida para convertir una empresa Legacy.',409,'LEGACY_ASSIGNMENT_CONFIRMATION_REQUIRED')
 const [{data:company,error:companyError},{data:existing,error:subError},{data:vertical,error:verticalError}]=await Promise.all([
  supabase.from('companies').select('id,name').eq('id',companyId).maybeSingle(),
  supabase.from('saas_company_subscriptions').select('id,status').eq('company_id',companyId).maybeSingle(),
  supabase.from('saas_verticals').select('id,name,active').eq('id',verticalId).maybeSingle(),
 ])
 if(companyError)throw companyError;if(subError)throw subError;if(verticalError)throw verticalError
 if(!company)throw httpError('Empresa no encontrada.',404,'COMPANY_NOT_FOUND')
 if(existing)throw httpError('La empresa ya tiene una membresía. Usá el cambio de plan normal.',409,'COMPANY_ALREADY_SUBSCRIBED')
 if(!vertical?.active)throw httpError('El rubro seleccionado no está disponible.',409,'VERTICAL_UNAVAILABLE')
 await validatePlanAndUsage({supabase,companyId,planId})
 const trialDays=Math.max(0,Math.min(90,Number(request.body?.trial_days??14)))
 const requestedStatus=String(request.body?.status||'trial').toLowerCase()
 if(!['trial','active'].includes(requestedStatus))throw httpError('Una empresa Legacy solo puede iniciar como trial o active.',400,'LEGACY_ASSIGNMENT_STATUS_INVALID')
 const now=new Date(),isTrial=requestedStatus==='trial',trialEnd=isTrial&&trialDays?new Date(now.getTime()+trialDays*86400000).toISOString():null
 const {data:subscription,error}=await supabase.from('saas_company_subscriptions').insert({company_id:companyId,plan_id:planId,vertical_id:verticalId,status:requestedStatus,trial_ends_at:trialEnd,current_period_start:isTrial?null:now.toISOString(),current_period_end:isTrial?null:new Date(now.getTime()+30*86400000).toISOString(),notes:`Asignación explícita desde Legacy por ${actor.email}`}).select('*').single()
 if(error)throw error
 await supabase.from('saas_billing_events').insert({company_id:companyId,subscription_id:subscription.id,event_type:'LEGACY_PLAN_ASSIGNED',metadata:{actor:actor.email,plan_id:planId,vertical_id:verticalId,status:requestedStatus,trial_days:trialDays}})
 return{ok:true,company:{id:company.id,name:company.name},subscription,legacy_converted:true,activation_payment_recorded:false}
}

export async function updateSaasSubscriptionSafely({request,supabase}){await assertAdmin({request,supabase});const companyId=String(request.params.companyId||'').trim(),planId=String(request.body?.plan_id||'').trim();if(planId)await validatePlanAndUsage({supabase,companyId,planId})
 if(request.body?.renew===true&&String(request.body?.status||'')==='active'){const renewed=await wasJustRenewedByMonthlyPayment({supabase,companyId});if(renewed)return{ok:true,subscription:renewed,renewal_already_applied:true}}
 return updateSaasSubscription({request,supabase})
}
