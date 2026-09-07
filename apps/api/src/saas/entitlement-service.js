function httpError(message,statusCode=400,code='SAAS_ACCESS_ERROR'){const e=new Error(message);e.statusCode=statusCode;e.code=code;return e}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
const LEGACY_MODULES=['DASHBOARD','CLIENTS','QUOTES','PRODUCTION','INVENTORY','DTE','CASH','SUPPLIERS','PURCHASES','AI','REPORTS','SECURITY','USERS']

async function membershipFor({request,supabase,companyId}){
 const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error:userError}=await supabase.auth.getUser(token);if(userError||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID')
 const {data:membership,error:memberError}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',user.id).maybeSingle();if(memberError)throw memberError;if(!membership)throw httpError('No tenés acceso a esta empresa.',403,'COMPANY_ACCESS_REQUIRED')
 return{user,membership}
}

async function resolveEntitlements({request,supabase,companyId}){
 const {user,membership}=await membershipFor({request,supabase,companyId})
 const {data:subscription,error:subError}=await supabase.from('saas_company_subscriptions').select('*').eq('company_id',companyId).maybeSingle();if(subError)throw subError
 const {count:users,error:userCountError}=await supabase.from('company_members').select('*',{count:'exact',head:true}).eq('company_id',companyId);if(userCountError)throw userCountError
 if(!subscription)return{user,company_id:companyId,role:String(membership.role||''),access:true,status:'legacy',reason:null,legacy:true,modules:LEGACY_MODULES,plan:null,usage:{users:Number(users||0),max_users:null},subscription:null}
 const {data:plan,error:planError}=await supabase.from('saas_plans').select('*').eq('id',subscription.plan_id).maybeSingle();if(planError)throw planError
 const [{data:planModules,error:pmError},{data:overrides,error:ovError}]=await Promise.all([
  supabase.from('saas_plan_modules').select('enabled,module:saas_modules(code,name)').eq('plan_id',subscription.plan_id),
  supabase.from('saas_company_module_overrides').select('enabled,module:saas_modules(code,name),reason').eq('company_id',companyId)
 ]);if(pmError)throw pmError;if(ovError)throw ovError
 const moduleMap=new Map();for(const row of planModules||[])if(row.module?.code)moduleMap.set(row.module.code,row.enabled!==false);for(const row of overrides||[])if(row.module?.code)moduleMap.set(row.module.code,row.enabled===true)
 const status=String(subscription.status||'');const now=Date.now();const graceValid=status==='past_due'&&subscription.grace_ends_at&&new Date(subscription.grace_ends_at).getTime()>now;const access=['trial','active'].includes(status)||Boolean(graceValid)
 const modules=access?[...moduleMap.entries()].filter(([,enabled])=>enabled).map(([code])=>code):[]
 return{user,company_id:companyId,role:String(membership.role||''),access,status,reason:access?null:(status==='past_due'?'El período de gracia de la membresía finalizó.':'La membresía está suspendida o cancelada.'),legacy:false,plan:plan?{id:plan.id,code:plan.code,name:plan.name,max_users:plan.max_users,max_branches:plan.max_branches,dte_enabled:plan.dte_enabled,ai_enabled:plan.ai_enabled,mobile_apps_enabled:plan.mobile_apps_enabled,monthly_price:plan.monthly_price,activation_fee:plan.activation_fee}:null,modules,usage:{users:Number(users||0),max_users:Number(plan?.max_users||0)},subscription:{status:subscription.status,trial_ends_at:subscription.trial_ends_at,current_period_end:subscription.current_period_end,grace_ends_at:subscription.grace_ends_at,activation_paid_at:subscription.activation_paid_at}}
}

export async function getCompanyEntitlements({request,supabase}){
 const companyId=String(request.query?.company_id||'').trim();if(!companyId)throw httpError('company_id es obligatorio.')
 const result=await resolveEntitlements({request,supabase,companyId});const {user,...safe}=result;return safe
}

export async function requireSaasFeature({request,supabase,companyId,moduleCode,featureLabel='esta función'}){
 const id=String(companyId||'').trim();if(!id)throw httpError('company_id es obligatorio.')
 const access=await resolveEntitlements({request,supabase,companyId:id})
 if(access.legacy)return access
 if(!access.access)throw httpError(access.reason||'La membresía no permite usar esta función.',403,'SAAS_SUBSCRIPTION_BLOCKED')
 if(moduleCode&&!access.modules.includes(moduleCode))throw httpError(`El plan ${access.plan?.name||'actual'} no incluye ${featureLabel}.`,403,'SAAS_PLAN_FEATURE_REQUIRED')
 return access
}
