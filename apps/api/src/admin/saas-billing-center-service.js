function httpError(message,statusCode=400,code='SAAS_BILLING_ERROR'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}
function configuredAdmins(){return new Set(String(process.env.IDEALO_PLATFORM_ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean))}
async function platformActor({request,supabase}){const token=bearer(request);if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED');const {data:{user},error}=await supabase.auth.getUser(token);if(error||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID');const admins=configuredAdmins();if(!admins.size)throw httpError('El Panel Maestro todavía no tiene administradores configurados.',503,'PLATFORM_ADMIN_NOT_CONFIGURED');if(!admins.has(String(user.email||'').toLowerCase()))throw httpError('Acceso reservado para administración de IDEALO.',403,'PLATFORM_ADMIN_REQUIRED');return user}
function receiptNumber(event){const day=String(event.occurred_at||event.created_at||'').slice(0,10).replaceAll('-','');return `IDEALO-${day||'PAGO'}-${String(event.id||'').slice(0,8).toUpperCase()}`}
function chargeType(event){const value=String(event.metadata?.charge_type||'').toLowerCase();if(['activation','monthly','other'].includes(value))return value;return event.event_type==='ACTIVATION_PAYMENT_RECORDED'?'activation':'monthly'}
export async function getSaasBillingCenter({request,supabase}){
 const actor=await platformActor({request,supabase})
 const [{data:companies,error:companyError},{data:subscriptions,error:subscriptionError},{data:plans,error:planError},{data:events,error:eventError}]=await Promise.all([
  supabase.from('companies').select('id,name,slug,demo_mode').order('name'),
  supabase.from('saas_company_subscriptions').select('*'),
  supabase.from('saas_plans').select('*').order('sort_order'),
  supabase.from('saas_billing_events').select('id,company_id,subscription_id,event_type,amount,currency,external_reference,metadata,occurred_at,created_at').in('event_type',['ACTIVATION_PAYMENT_RECORDED','PAYMENT_RECORDED']).order('occurred_at',{ascending:false}).limit(500)
 ])
 if(companyError)throw companyError;if(subscriptionError)throw subscriptionError;if(planError)throw planError;if(eventError)throw eventError
 const planMap=new Map((plans||[]).map(row=>[row.id,row])),subMap=new Map((subscriptions||[]).map(row=>[row.company_id,row])),eventsByCompany=new Map()
 const payments=(events||[]).map(event=>({...event,charge_type:chargeType(event),receipt_number:receiptNumber(event)}))
 for(const event of payments){const list=eventsByCompany.get(event.company_id)||[];list.push(event);eventsByCompany.set(event.company_id,list)}
 const now=Date.now()
 const rows=(companies||[]).map(company=>{const subscription=subMap.get(company.id)||null,plan=subscription?planMap.get(subscription.plan_id)||null:null;const activationPending=Boolean(subscription&&plan&&!subscription.activation_paid_at&&Number(plan.activation_fee||0)>0);const monthlyPending=Boolean(subscription&&plan&&['past_due','suspended'].includes(subscription.status));const balanceDue=(activationPending?Number(plan?.activation_fee||0):0)+(monthlyPending?Number(plan?.monthly_price||0):0);const nextChargeAt=subscription?.status==='trial'?(subscription.trial_ends_at||null):(subscription?.current_period_end||null);const companyPayments=eventsByCompany.get(company.id)||[];return{...company,subscription:subscription?{...subscription,plan}:null,activation_pending:activationPending,monthly_pending:monthlyPending,balance_due:balanceDue,next_charge_at:nextChargeAt,overdue_days:nextChargeAt&&new Date(nextChargeAt).getTime()<now?Math.floor((now-new Date(nextChargeAt).getTime())/86400000):0,total_paid:companyPayments.reduce((sum,event)=>sum+Number(event.amount||0),0),payments:companyPayments.slice(0,50)}})
 return{actor:{email:actor.email},metrics:{companies:rows.length,balance_due:rows.reduce((sum,row)=>sum+row.balance_due,0),activation_pending:rows.filter(row=>row.activation_pending).length,monthly_pending:rows.filter(row=>row.monthly_pending).length,total_collected:payments.reduce((sum,event)=>sum+Number(event.amount||0),0)},companies:rows,payments}
}
