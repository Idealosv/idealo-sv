import 'dotenv/config'
import { getSupabaseAdmin } from './lib/supabase.js'
import { seedAgencyDemo } from './admin/demo-seed-service.js'

const enabled=String(process.env.IDEALO_GENERIC_DEMO_ENABLED||'').toLowerCase()==='true'
const email=String(process.env.IDEALO_GENERIC_DEMO_EMAIL||'').trim().toLowerCase()
const password=String(process.env.IDEALO_GENERIC_DEMO_PASSWORD||'')
const slug='idealo-sv-demostracion'

async function findUserByEmail(supabase,target){
 for(let page=1;page<=10;page++){
  const {data,error}=await supabase.auth.admin.listUsers({page,perPage:100})
  if(error)throw error
  const user=(data?.users||[]).find(x=>String(x.email||'').toLowerCase()===target)
  if(user)return user
  if((data?.users||[]).length<100)break
 }
 return null
}

async function ensureUser(supabase){
 let user=await findUserByEmail(supabase,email)
 if(!user){
  const {data,error}=await supabase.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'IDEALO SV DEMO'}})
  if(error)throw error
  user=data.user
 }else{
  const {data,error}=await supabase.auth.admin.updateUserById(user.id,{password,email_confirm:true,user_metadata:{full_name:'IDEALO SV DEMO'}})
  if(error)throw error
  user=data.user||user
 }
 if(!user)throw new Error('No se pudo crear o localizar el usuario demo.')
 return user
}

async function ensureMembership(supabase,companyId,userId){
 const {data,error}=await supabase.from('company_members').select('role').eq('company_id',companyId).eq('user_id',userId).maybeSingle()
 if(error)throw error
 if(!data){const {error:insertError}=await supabase.from('company_members').insert({company_id:companyId,user_id:userId,role:'owner'});if(insertError)throw insertError;return}
 if(String(data.role).toLowerCase()!=='owner'){const {error:updateError}=await supabase.from('company_members').update({role:'owner'}).eq('company_id',companyId).eq('user_id',userId);if(updateError)throw updateError}
}

async function ensureSubscription(supabase,{companyId,planId,verticalId,expiry}){
 const {data,error}=await supabase.from('saas_company_subscriptions').select('id').eq('company_id',companyId).maybeSingle()
 if(error)throw error
 const payload={plan_id:planId,vertical_id:verticalId,status:'trial',trial_ends_at:expiry,grace_ends_at:null,suspended_at:null,cancelled_at:null,notes:'Entorno DEMO comercial compartido. No representa cliente activo ni facturación real.',updated_at:new Date().toISOString()}
 if(data){const {error:updateError}=await supabase.from('saas_company_subscriptions').update(payload).eq('id',data.id);if(updateError)throw updateError;return}
 const {error:insertError}=await supabase.from('saas_company_subscriptions').insert({company_id:companyId,...payload});if(insertError)throw insertError
}

async function ensureDemoProfile(supabase,{companyId,userId,expiry}){
 const {data,error}=await supabase.from('saas_company_demo_profiles').select('company_id').eq('company_id',companyId).maybeSingle()
 if(error)throw error
 const payload={is_demo:true,demo_expires_at:expiry,block_dte_production:true,block_external_email:true,resettable:true,seed_version:1,created_by:userId,notes:'Demo genérico para prospectos. Credenciales compartidas y DTE únicamente TEST.',updated_at:new Date().toISOString()}
 if(data){const {error:updateError}=await supabase.from('saas_company_demo_profiles').update(payload).eq('company_id',companyId);if(updateError)throw updateError;return}
 const {error:insertError}=await supabase.from('saas_company_demo_profiles').insert({company_id:companyId,...payload});if(insertError)throw insertError
}

async function run(){
 if(!enabled)return
 if(!email||password.length<12)throw new Error('Demo genérico habilitado sin correo o contraseña segura.')
 const supabase=getSupabaseAdmin()
 const user=await ensureUser(supabase)
 const [{data:plan,error:planError},{data:vertical,error:verticalError}]=await Promise.all([
  supabase.from('saas_plans').select('id').eq('code','BUSINESS').eq('active',true).single(),
  supabase.from('saas_verticals').select('id').eq('code','ADVERTISING').single(),
 ])
 if(planError)throw planError
 if(verticalError)throw verticalError

 const expiry=new Date(Date.now()+365*86400000).toISOString()
 const {data:existingCompany,error:existingError}=await supabase.from('companies').select('id,demo_seeded_at').eq('slug',slug).maybeSingle()
 if(existingError)throw existingError
 let company=existingCompany
 if(!company){
  const {data,error}=await supabase.from('companies').insert({name:'IDEALO SV – DEMOSTRACIÓN',slug,created_by:user.id,demo_mode:true,demo_label:'DEMO COMERCIAL · IDEALO SV',demo_expires_at:expiry}).select('id,demo_seeded_at').single()
  if(error)throw error
  company=data
 }else{
  const {error}=await supabase.from('companies').update({name:'IDEALO SV – DEMOSTRACIÓN',created_by:user.id,demo_mode:true,demo_label:'DEMO COMERCIAL · IDEALO SV',demo_expires_at:expiry,updated_at:new Date().toISOString()}).eq('id',company.id)
  if(error)throw error
 }

 await ensureMembership(supabase,company.id,user.id)
 await ensureSubscription(supabase,{companyId:company.id,planId:plan.id,verticalId:vertical.id,expiry})
 await ensureDemoProfile(supabase,{companyId:company.id,userId:user.id,expiry})
 const seed=await seedAgencyDemo({supabase,companyId:company.id,createdBy:user.id})
 console.log('DEMO_GENERIC_READY',company.id,user.id,email,seed.seeded_at)
}

run().catch(error=>{
 console.error('DEMO_GENERIC_BOOTSTRAP_FAILED',error?.message||error)
 console.error('DEMO_GENERIC_BOOTSTRAP_NON_FATAL: la API continuará disponible y el próximo arranque volverá a intentar la precarga.')
})
