import 'dotenv/config'
import { getSupabaseAdmin } from './lib/supabase.js'

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

async function seedDemo(supabase,companyId){
 const {data:clients,error:clientError}=await supabase.from('clients').insert([
  {company_id:companyId,name:'[DEMO] Café Central',email:'compras@cafe-demo.example',phone:'7000-1001',notes:'Cliente ficticio para demostrar cotizaciones, producción y seguimiento.'},
  {company_id:companyId,name:'[DEMO] Clínica Sonrisa',email:'mercadeo@clinica-demo.example',phone:'7000-1002',notes:'Cliente ficticio para pruebas del ERP.'},
  {company_id:companyId,name:'[DEMO] Constructora Norte',email:'proyectos@constructora-demo.example',phone:'7000-1003',notes:'Cliente ficticio para pruebas del ERP.'},
 ]).select('id,name')
 if(clientError)throw clientError
 const {data:products,error:productError}=await supabase.from('finished_products').insert([
  {company_id:companyId,name:'[DEMO] Banner lona 13 oz',sku:'DEMO-LONA-001',category:'Impresión gran formato',description:'Banner impreso con acabados básicos.',unit:'m²',sale_price:18,cost_estimate:8,design_included:true,requires_production:true,tags:['DEMO','LONA']},
  {company_id:companyId,name:'[DEMO] Rótulo PVC 5 mm',sku:'DEMO-PVC-001',category:'Rotulación',description:'PVC impreso para señalización interior.',unit:'m²',sale_price:34,cost_estimate:16,design_included:true,requires_production:true,tags:['DEMO','PVC']},
  {company_id:companyId,name:'[DEMO] Camisa personalizada',sku:'DEMO-TEX-001',category:'Textil',description:'Camisa personalizada para marca o evento.',unit:'unidad',sale_price:12.5,cost_estimate:6.25,design_included:true,requires_production:true,tags:['DEMO','TEXTIL']},
  {company_id:companyId,name:'[DEMO] Taza personalizada',sku:'DEMO-SUB-001',category:'Sublimación',description:'Taza promocional personalizada.',unit:'unidad',sale_price:7.5,cost_estimate:3.25,design_included:true,requires_production:true,tags:['DEMO','SUBLIMACION']},
 ]).select('id,name,sale_price')
 if(productError)throw productError
 const cafe=clients?.[0],clinica=clients?.[1],lona=products?.[0],camisa=products?.[2]
 const now=new Date(),validUntil=new Date(now.getTime()+10*86400000).toISOString().slice(0,10)
 const {data:quotes,error:quoteError}=await supabase.from('quotes').insert([
  {company_id:companyId,client_id:cafe?.id,status:'SENT',title:'[DEMO] Campaña apertura sucursal',project_name:'Apertura Café Central',valid_until:validUntil,subtotal:216,discount:0,total:216,balance_amount:216,customer_notes:'Datos ficticios de demostración.',tags:['DEMO']},
  {company_id:companyId,client_id:clinica?.id,status:'APPROVED',title:'[DEMO] Uniformes promocionales',project_name:'Jornada de salud',valid_until:validUntil,subtotal:250,discount:0,total:250,balance_amount:250,approved_at:now.toISOString(),tags:['DEMO']},
 ]).select('id,title')
 if(quoteError)throw quoteError
 const quote1=quotes?.[0],quote2=quotes?.[1]
 if(quote1&&lona){const {error}=await supabase.from('quote_items').insert({quote_id:quote1.id,product_id:lona.id,sku:'DEMO-LONA-001',category:'Impresión gran formato',description:'Banner de lona para fachada',quantity:12,unit:'m²',unit_price:18,line_total:216,unit_cost:8,cost_total:96,profit_total:120,margin_percent:55.56,design_included:true,requires_production:true});if(error)throw error}
 if(quote2&&camisa){const {error}=await supabase.from('quote_items').insert({quote_id:quote2.id,product_id:camisa.id,sku:'DEMO-TEX-001',category:'Textil',description:'Camisas personalizadas',quantity:20,unit:'unidad',unit_price:12.5,line_total:250,unit_cost:6.25,cost_total:125,profit_total:125,margin_percent:50,design_included:true,requires_production:true});if(error)throw error}
 if(quote2){const {error}=await supabase.from('work_orders').insert({company_id:companyId,quote_id:quote2.id,client_id:clinica?.id,status:'PRODUCTION',title:'[DEMO] Producción uniformes Clínica Sonrisa',due_at:new Date(now.getTime()+3*86400000).toISOString(),production_notes:'Orden ficticia precargada para demostrar el flujo de producción.',total:250});if(error)throw error}
 const {error:markError}=await supabase.from('companies').update({demo_seeded_at:new Date().toISOString()}).eq('id',companyId)
 if(markError)throw markError
}

async function run(){
 if(!enabled)return
 if(!email||password.length<12)throw new Error('Demo genérico habilitado sin correo o contraseña segura.')
 const supabase=getSupabaseAdmin()
 const {data:existingCompany,error:existingError}=await supabase.from('companies').select('id').eq('slug',slug).maybeSingle()
 if(existingError)throw existingError
 if(existingCompany){console.log('DEMO_GENERIC_READY',existingCompany.id);return}
 let user=await findUserByEmail(supabase,email)
 let createdUser=false
 if(!user){
  const {data,error}=await supabase.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'IDEALO SV DEMO'}})
  if(error)throw error
  user=data.user
  createdUser=true
 }
 if(!user)throw new Error('No se pudo crear el usuario demo.')
 let companyId=null
 try{
  const [{data:plan,error:planError},{data:vertical,error:verticalError}]=await Promise.all([
   supabase.from('saas_plans').select('id').eq('code','BUSINESS').eq('active',true).single(),
   supabase.from('saas_verticals').select('id').eq('code','ADVERTISING').single(),
  ])
  if(planError)throw planError
  if(verticalError)throw verticalError
  const expiry=new Date(Date.now()+365*86400000).toISOString()
  const {data:company,error:companyError}=await supabase.from('companies').insert({name:'IDEALO SV – DEMOSTRACIÓN',slug,created_by:user.id,demo_mode:true,demo_label:'DEMO COMERCIAL · IDEALO SV',demo_expires_at:expiry}).select('id').single()
  if(companyError)throw companyError
  companyId=company.id
  const {error:memberError}=await supabase.from('company_members').insert({company_id:company.id,user_id:user.id,role:'owner'})
  if(memberError)throw memberError
  const {error:subError}=await supabase.from('saas_company_subscriptions').insert({company_id:company.id,plan_id:plan.id,vertical_id:vertical.id,status:'trial',trial_ends_at:expiry,notes:'Entorno DEMO comercial compartido. No representa cliente activo ni facturación real.'})
  if(subError)throw subError
  const {error:profileError}=await supabase.from('saas_company_demo_profiles').insert({company_id:company.id,is_demo:true,block_dte_production:true,block_external_email:true,resettable:true,seed_version:'sales-v1',notes:'Demo genérico para prospectos. Credenciales compartidas y DTE únicamente TEST.'})
  if(profileError)throw profileError
  await seedDemo(supabase,company.id)
  console.log('DEMO_GENERIC_CREATED',company.id,user.id,email)
 }catch(error){
  if(companyId)await supabase.from('companies').delete().eq('id',companyId)
  if(createdUser)await supabase.auth.admin.deleteUser(user.id)
  throw error
 }
}

run().catch(error=>{console.error('DEMO_GENERIC_BOOTSTRAP_FAILED',error?.message||error);process.exitCode=1})
