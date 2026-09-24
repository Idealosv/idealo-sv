function httpError(message,statusCode=400,code='INVESTOR_CONTEXT_ERROR'){const error=new Error(message);error.statusCode=statusCode;error.code=code;return error}
function bearer(request){const value=String(request.headers?.authorization||'');return value.startsWith('Bearer ')?value.slice(7).trim():''}

export async function resolveInvestorCompanyContext({request,supabase}){
 const token=bearer(request)
 if(!token)throw httpError('Sesión requerida.',401,'AUTH_REQUIRED')
 const {data:{user},error:userError}=await supabase.auth.getUser(token)
 if(userError||!user)throw httpError('Sesión inválida o vencida.',401,'AUTH_INVALID')

 const preferredCompanyId=String(request.query?.company_id||'').trim()
 const {data:memberships,error:memberError}=await supabase
  .from('company_members')
  .select('company_id,role')
  .eq('user_id',user.id)
 if(memberError)throw memberError
 if(!memberships?.length)throw httpError('No tenés empresas asignadas.',404,'NO_COMPANY_MEMBERSHIPS')

 const companyIds=memberships.map(row=>row.company_id)
 const [{data:companies,error:companyError},{data:subscriptions,error:subError},{data:verticals,error:verticalError},{data:plans,error:planError}]=await Promise.all([
  supabase.from('companies').select('id,name,slug,demo_mode').in('id',companyIds),
  supabase.from('saas_company_subscriptions').select('company_id,plan_id,vertical_id,status,trial_ends_at,current_period_end,grace_ends_at').in('company_id',companyIds),
  supabase.from('saas_verticals').select('id,code,name').eq('code','FINANCIAL_INVESTORS'),
  supabase.from('saas_plans').select('id,code,name,max_users,dte_enabled,ai_enabled,mobile_apps_enabled')
 ])
 if(companyError)throw companyError
 if(subError)throw subError
 if(verticalError)throw verticalError
 if(planError)throw planError

 const vertical=verticals?.[0]
 if(!vertical)throw httpError('El vertical Financiera · Inversionistas no está configurado.',500,'INVESTOR_VERTICAL_MISSING')

 const companyMap=new Map((companies||[]).map(row=>[row.id,row]))
 const memberMap=new Map((memberships||[]).map(row=>[row.company_id,row]))
 const planMap=new Map((plans||[]).map(row=>[row.id,row]))

 const candidates=(subscriptions||[])
  .filter(row=>row.vertical_id===vertical.id&&companyMap.has(row.company_id))
  .map(row=>({
   company:companyMap.get(row.company_id),
   membership:memberMap.get(row.company_id),
   subscription:row,
   plan:planMap.get(row.plan_id)||null,
  }))
  .sort((a,b)=>{
   const active=x=>['active','trial'].includes(String(x.subscription?.status||''))?0:1
   const delta=active(a)-active(b)
   if(delta)return delta
   return String(a.company?.name||'').localeCompare(String(b.company?.name||''))
  })

 if(!candidates.length)throw httpError('Tu usuario no tiene acceso a una empresa del rubro Financiera · Inversionistas.',404,'INVESTOR_COMPANY_NOT_FOUND')

 let selected=candidates.find(row=>row.company.id===preferredCompanyId)
 if(!selected)selected=candidates[0]

 const status=String(selected.subscription?.status||'')
 const graceValid=status==='past_due'&&selected.subscription?.grace_ends_at&&new Date(selected.subscription.grace_ends_at).getTime()>Date.now()
 if(!['trial','active'].includes(status)&&!graceValid){
  throw httpError('La membresía de esta empresa está suspendida, vencida o cancelada. Reactivala desde el Administrador de Membresías.',403,'INVESTOR_SUBSCRIPTION_BLOCKED')
 }

 return{
  ok:true,
  company:{
   id:selected.company.id,
   name:selected.company.name,
   slug:selected.company.slug,
   demo_mode:Boolean(selected.company.demo_mode),
  },
  role:String(selected.membership?.role||''),
  vertical:{id:vertical.id,code:vertical.code,name:vertical.name},
  plan:selected.plan,
  subscription:{
   status:selected.subscription.status,
   trial_ends_at:selected.subscription.trial_ends_at,
   current_period_end:selected.subscription.current_period_end,
   grace_ends_at:selected.subscription.grace_ends_at,
  },
  available_companies:candidates.map(row=>({
   id:row.company.id,
   name:row.company.name,
   demo_mode:Boolean(row.company.demo_mode),
   role:String(row.membership?.role||''),
   plan:row.plan?{id:row.plan.id,code:row.plan.code,name:row.plan.name}:null,
   status:row.subscription.status,
  })),
 }
}
