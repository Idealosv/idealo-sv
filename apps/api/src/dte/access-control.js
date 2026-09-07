function httpError(message,statusCode=403,code='DTE_FORBIDDEN'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}

export function bearerToken(request){const authorization=String(request.headers?.authorization||'');return authorization.startsWith('Bearer ')?authorization.slice(7).trim():''}

export async function requireAuthenticatedUser({request,supabase}){
 const token=bearerToken(request)
 if(!token)throw httpError('Debes iniciar sesión para realizar esta operación DTE.',401,'AUTH_REQUIRED')
 const {data,error}=await supabase.auth.getUser(token)
 if(error||!data?.user)throw httpError('La sesión no es válida o ya venció.',401,'AUTH_INVALID')
 return data.user
}

export async function requireCompanyRole({supabase,companyId,userId,allowedRoles,operation='realizar esta operación DTE'}){
 const {data:membership,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',userId).maybeSingle()
 if(error)throw error
 const role=String(membership?.role||'').toLowerCase()
 if(!role)throw httpError('No tienes acceso a esta empresa.',403,'COMPANY_ACCESS_REQUIRED')
 await requireDteSubscription({supabase,companyId,userId,role,operation})
 if(!allowedRoles.includes(role)){
  await registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles,reason:'role'})
  throw httpError(`Tu rol no tiene permiso para ${operation}.`,403,'DTE_ROLE_FORBIDDEN')
 }
 return role
}

async function requireDteSubscription({supabase,companyId,userId,role,operation}){
 const {data:subscription,error:subError}=await supabase.from('saas_company_subscriptions').select('status,grace_ends_at,plan_id').eq('company_id',companyId).maybeSingle()
 if(subError)throw subError
 if(!subscription)return true
 const {data:plan,error:planError}=await supabase.from('saas_plans').select('code,name,dte_enabled').eq('id',subscription.plan_id).maybeSingle()
 if(planError)throw planError
 const status=String(subscription.status||'')
 const graceValid=status==='past_due'&&subscription.grace_ends_at&&new Date(subscription.grace_ends_at).getTime()>Date.now()
 const subscriptionAllowed=['trial','active'].includes(status)||Boolean(graceValid)
 if(!subscriptionAllowed){
  await registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles:[],reason:'subscription',plan:plan?.code,status})
  throw httpError('La membresía no permite utilizar Facturación Electrónica DTE.',403,'DTE_SUBSCRIPTION_BLOCKED')
 }
 if(plan?.dte_enabled!==true){
  await registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles:[],reason:'plan',plan:plan?.code,status})
  throw httpError(`El plan ${plan?.name||'actual'} no incluye Facturación Electrónica DTE.`,403,'DTE_PLAN_REQUIRED')
 }
 return true
}

async function registerDeniedAttempt(supabase,{companyId,userId,role,operation,allowedRoles,reason='role',plan=null,status=null}){
 try{await supabase.from('company_admin_audit').insert({company_id:companyId,actor_user_id:userId,target_user_id:userId,action:reason==='role'?'DTE_ACCESS_DENIED':'DTE_PLAN_ACCESS_DENIED',detail:{role,operation,allowed_roles:allowedRoles,reason,plan,status}})}catch(error){console.error('No se pudo auditar un acceso DTE rechazado:',error?.message||error)}
}

export const DTE_ROLES={
 DRAFT:['owner','admin'],
 SIGN:['owner','admin'],
 TRANSMIT_TEST:['owner','admin'],
 TRANSMIT_PRODUCTION:['owner'],
}
