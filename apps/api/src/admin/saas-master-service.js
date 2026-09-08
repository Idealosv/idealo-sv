import { seedAgencyDemo } from './demo-seed-service.js'

function httpError(message,statusCode=400,code='SAAS_MASTER_ERROR'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
function configuredAdmins(){return new Set(String(process.env.IDEALO_PLATFORM_ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean))}
async function platformActor({request,supabase}){const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED');const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID');const admins=configuredAdmins();if(!admins.size)throw httpError('El Panel Maestro todavía no tiene administradores configurados.',503,'PLATFORM_ADMIN_NOT_CONFIGURED');if(!admins.has(String(user.email||'').toLowerCase()))throw httpError('Acceso reservado para administración de IDEALO.',403,'PLATFORM_ADMIN_REQUIRED');return user}
async function findUserByEmail(supabase,email){let page=1;while(page<=10){const {data,error}=await supabase.auth.admin.listUsers({page,perPage:100});if(error)throw error;const found=(data?.users||[]).find(user=>String(user.email||'').toLowerCase()===email);if(found)return found;if((data?.users||[]).length<100)break;page++}return null}
function slugify(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)}
function accountType(company,plan){if(company?.demo_mode)return'demo';if(String(plan?.code||'').toUpperCase()==='OWNER_INTERNAL')return'internal';return'commercial'}
function commercialPlans(plans=[]){return plans.filter(plan=>plan?.active!==false&&String(plan?.code||'').toUpperCase()!=='OWNER_INTERNAL')}
async function requireCommercialPlan(supabase,planId){const {data,error}=await supabase.from('saas_plans').select('id,code,name,active').eq('id',planId).maybeSingle();if(error)throw error;if(!data||data.active===false||String(data.code||'').toUpperCase()==='OWNER_INTERNAL')throw httpError('Seleccioná un plan comercial activo.',400,'COMMERCIAL_PLAN_REQUIRED');return data}
async function catalogs(supabase){const [{data:plans,error:planError},{data:verticals,error:verticalError},{data:modules,error:moduleError}]=await Promise.all([supabase.from('saas_plans').select('*').order('sort_order'),supabase.from('saas_verticals').select('*').order('name'),supabase.from('saas_modules').select('*').order('name')]);if(planError)throw planError;if(verticalError)throw verticalError;if(moduleError)throw moduleError;return{plans:plans||[],commercial_plans:commercialPlans(plans||[]),verticals:verticals||[],modules:modules||[]}}

export async function getSaasMasterDashboard({request,supabase}){
 const actor=await platformActor({request,supabase})
 const [{data:companies,error:companyError},{data:subscriptions,error:subscriptionError},{data:members,error:memberError},catalog]=await Promise.all([
  supabase.from('companies').select('id,name,slug,created_at,updated_at,demo_mode,demo_label,demo_expires_at,demo_seeded_at').order('created_at',{ascending:false}),
  supabase.from('saas_company_subscriptions').select('*'),
  supabase.from('company_members').select('company_id,user_id,role'),
  catalogs(supabase),
 ])
 if(companyError)throw companyError;if(subscriptionError)throw subscriptionError;if(memberError)throw memberError
 const planMap=new Map(catalog.plans.map(x=>[x.id,x]));const verticalMap=new Map(catalog.verticals.map(x=>[x.id,x]));const subMap=new Map((subscriptions||[]).map(x=>[x.company_id,x]));const memberCount=new Map()
 for(const row of members||[])memberCount.set(row.company_id,(memberCount.get(row.company_id)||0)+1)
 const rows=(companies||[]).map(company=>{const subscription=subMap.get(company.id)||null;const plan=subscription?planMap.get(subscription.plan_id)||null:null;const type=accountType(company,plan);return{...company,users:memberCount.get(company.id)||0,account_type:type,billing_exempt:type!=='commercial',subscription:subscription?{...subscription,plan,vertical:verticalMap.get(subscription.vertical_id)||null}:null}})
 const commercial=rows.filter(row=>row.account_type==='commercial'),now=Date.now()
 const metrics={
  companies:commercial.length,
  total_companies:rows.length,
  active:commercial.filter(x=>x.subscription?.status==='active').length,
  trial:commercial.filter(x=>x.subscription?.status==='trial').length,
  demos:rows.filter(x=>x.account_type==='demo').length,
  internal:rows.filter(x=>x.account_type==='internal').length,
  past_due:commercial.filter(x=>x.subscription?.status==='past_due').length,
  suspended:commercial.filter(x=>x.subscription?.status==='suspended').length,
  cancelled:commercial.filter(x=>x.subscription?.status==='cancelled').length,
  activation_pending:commercial.filter(x=>x.subscription&&!x.subscription.activation_paid_at&&Number(x.subscription?.plan?.activation_fee||0)>0&&x.subscription?.status!=='cancelled').length,
  activation_collected:commercial.filter(x=>x.subscription?.activation_paid_at).reduce((sum,x)=>sum+Number(x.subscription?.activation_paid_amount||0),0),
  expiring_soon:commercial.filter(x=>{const end=x.subscription?.current_period_end||x.subscription?.trial_ends_at;if(!end)return false;const delta=new Date(end).getTime()-now;return delta>=0&&delta<=7*86400000}).length,
  mrr:commercial.filter(x=>x.subscription?.status==='active').reduce((sum,x)=>sum+Number(x.subscription?.plan?.monthly_price||0),0),
 }
 return{actor:{email:actor.email},metrics,companies:rows,...catalog}
}

export async function createSaasCompany({request,supabase}){
 const actor=await platformActor({request,supabase})
 const name=String(request.body?.name||'').trim(),ownerEmail=String(request.body?.owner_email||'').trim().toLowerCase(),planId=String(request.body?.plan_id||''),verticalId=String(request.body?.vertical_id||''),trialDays=Math.max(0,Math.min(90,Number(request.body?.trial_days??14))),demoMode=request.body?.demo_mode===true
 if(name.length<2||!ownerEmail||!planId||!verticalId)throw httpError('Nombre, propietario, plan y rubro son obligatorios.')
 await requireCommercialPlan(supabase,planId)
 let owner=await findUserByEmail(supabase,ownerEmail)
 if(!owner){const {data,error}=await supabase.auth.admin.inviteUserByEmail(ownerEmail,{data:{full_name:name}});if(error)throw error;owner=data.user}
 if(!owner)throw httpError('No se pudo crear o localizar el propietario.',500)
 let slug=slugify(name)||'empresa'
 for(let i=0;i<5;i++){const candidate=i?`${slug}-${Date.now().toString().slice(-5)}-${i}`:slug;const {data:existing,error}=await supabase.from('companies').select('id').eq('slug',candidate).maybeSingle();if(error)throw error;if(!existing){slug=candidate;break}}
 const now=new Date(),trialEnd=trialDays?new Date(now.getTime()+trialDays*86400000).toISOString():null,demoExpiry=demoMode?(trialEnd||new Date(now.getTime()+14*86400000).toISOString()):null
 const {data:company,error:companyError}=await supabase.from('companies').insert({name,slug,created_by:owner.id,demo_mode:demoMode,demo_label:demoMode?`${name} · DEMO`:null,demo_expires_at:demoExpiry}).select('id,name,slug,created_at,demo_mode,demo_expires_at').single()
 if(companyError)throw companyError
 try{
  const {error:memberError}=await supabase.from('company_members').insert({company_id:company.id,user_id:owner.id,role:'owner'});if(memberError)throw memberError
  const status=trialDays?'trial':'active'
  const {error:subscriptionError}=await supabase.from('saas_company_subscriptions').insert({company_id:company.id,plan_id:planId,vertical_id:verticalId,status,trial_ends_at:trialEnd,current_period_start:trialDays?null:now.toISOString(),current_period_end:trialDays?null:new Date(now.getTime()+30*86400000).toISOString(),notes:`Creada desde Panel Maestro por ${actor.email}${demoMode?' · ENTORNO DEMO':''}`});if(subscriptionError)throw subscriptionError
  if(demoMode)await seedAgencyDemo({supabase,companyId:company.id,createdBy:owner.id})
  return{ok:true,company,demoSeeded:demoMode}
 }catch(error){await supabase.from('companies').delete().eq('id',company.id);throw error}
}

export async function updateSaasSubscription({request,supabase}){
 const actor=await platformActor({request,supabase});const companyId=String(request.params.companyId||''),status=String(request.body?.status||''),planId=String(request.body?.plan_id||''),verticalId=String(request.body?.vertical_id||'')
 if(!companyId)throw httpError('Empresa obligatoria.');if(status&&!['trial','active','past_due','suspended','cancelled'].includes(status))throw httpError('Estado de suscripción inválido.')
 const [{data:current,error:currentError},{data:company,error:companyError}]=await Promise.all([supabase.from('saas_company_subscriptions').select('*').eq('company_id',companyId).maybeSingle(),supabase.from('companies').select('id,demo_mode').eq('id',companyId).maybeSingle()]);if(currentError)throw currentError;if(companyError)throw companyError;if(!current)throw httpError('La empresa no tiene suscripción.',404,'SUBSCRIPTION_NOT_FOUND')
 let currentPlan=null;if(current.plan_id){const {data,error}=await supabase.from('saas_plans').select('id,code,name,active').eq('id',current.plan_id).maybeSingle();if(error)throw error;currentPlan=data}
 if(String(currentPlan?.code||'').toUpperCase()==='OWNER_INTERNAL'&&(status||planId||request.body?.renew===true))throw httpError('La empresa propietaria usa un plan interno protegido y no admite cobros, renovaciones ni cambios comerciales.',409,'INTERNAL_PLAN_PROTECTED')
 if(planId)await requireCommercialPlan(supabase,planId)
 if(company?.demo_mode&&request.body?.renew===true)throw httpError('Los entornos DEMO no se renuevan como una membresía de pago.',409,'DEMO_RENEWAL_BLOCKED')
 const payload={updated_at:new Date().toISOString()};if(status)payload.status=status;if(planId)payload.plan_id=planId;if(verticalId)payload.vertical_id=verticalId;if(status==='suspended')payload.suspended_at=new Date().toISOString();if(status==='cancelled')payload.cancelled_at=new Date().toISOString();if(status==='active'){payload.suspended_at=null;payload.cancelled_at=null;if(request.body?.renew===true){const start=new Date();payload.current_period_start=start.toISOString();payload.current_period_end=new Date(start.getTime()+30*86400000).toISOString();payload.grace_ends_at=null}}
 const {data,error}=await supabase.from('saas_company_subscriptions').update(payload).eq('company_id',companyId).select('*').maybeSingle();if(error)throw error;if(!data)throw httpError('La empresa no tiene suscripción.',404,'SUBSCRIPTION_NOT_FOUND')
 await supabase.from('saas_billing_events').insert({company_id:companyId,subscription_id:data.id,event_type:'MASTER_SUBSCRIPTION_UPDATED',metadata:{actor:actor.email,status:data.status,plan_id:data.plan_id,vertical_id:data.vertical_id}})
 return{ok:true,subscription:data}
}

export async function createSaasBillingEvent({request,supabase}){
 const actor=await platformActor({request,supabase});const companyId=String(request.params.companyId||''),amount=Number(request.body?.amount||0),reference=String(request.body?.reference||'').trim(),chargeType=String(request.body?.charge_type||'monthly').trim().toLowerCase()
 if(!companyId||!Number.isFinite(amount)||amount<=0)throw httpError('Empresa y monto válido son obligatorios.');if(!['activation','monthly','other'].includes(chargeType))throw httpError('Tipo de cobro inválido.')
 const [{data:company,error:companyError},{data:subscription,error:subError}]=await Promise.all([supabase.from('companies').select('id,demo_mode').eq('id',companyId).maybeSingle(),supabase.from('saas_company_subscriptions').select('*').eq('company_id',companyId).maybeSingle()]);if(companyError)throw companyError;if(subError)throw subError;if(!subscription)throw httpError('La empresa no tiene suscripción.',404,'SUBSCRIPTION_NOT_FOUND')
 let plan=null;if(subscription.plan_id){const {data,error}=await supabase.from('saas_plans').select('id,code,name').eq('id',subscription.plan_id).maybeSingle();if(error)throw error;plan=data}
 if(company?.demo_mode||String(plan?.code||'').toUpperCase()==='OWNER_INTERNAL')throw httpError('Esta cuenta es DEMO o interna y no admite cobros comerciales.',409,'BILLING_EXEMPT_ACCOUNT')
 const now=new Date();const {data:event,error}=await supabase.from('saas_billing_events').insert({company_id:companyId,subscription_id:subscription.id,event_type:chargeType==='activation'?'ACTIVATION_PAYMENT_RECORDED':'PAYMENT_RECORDED',amount,currency:'USD',external_reference:reference||null,metadata:{actor:actor.email,charge_type:chargeType}}).select('*').single();if(error)throw error
 const patch={last_payment_at:now.toISOString(),last_payment_amount:amount,last_payment_reference:reference||null,updated_at:now.toISOString()};if(chargeType==='activation'){patch.activation_paid_at=now.toISOString();patch.activation_paid_amount=amount;patch.activation_reference=reference||null}if(chargeType==='monthly'){patch.status='active';patch.suspended_at=null;patch.cancelled_at=null;patch.grace_ends_at=null;patch.current_period_start=now.toISOString();patch.current_period_end=new Date(now.getTime()+30*86400000).toISOString()}const {error:updateError}=await supabase.from('saas_company_subscriptions').update(patch).eq('id',subscription.id);if(updateError)throw updateError;if(chargeType==='monthly')await supabase.from('saas_payment_reminders').update({status:'dismissed'}).eq('subscription_id',subscription.id).eq('status','pending')
 return{ok:true,event,charge_type:chargeType,reactivated:chargeType==='monthly'}
}