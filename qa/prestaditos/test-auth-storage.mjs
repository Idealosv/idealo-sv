// LOCAL SUPABASE AUTH + STORAGE QA ONLY. Never connect to remote projects.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const {API_URL,ANON_KEY,SERVICE_ROLE_KEY}=process.env
if(!API_URL||!ANON_KEY||!SERVICE_ROLE_KEY)throw Error('Falta configuración local')
const host=new URL(API_URL)
if(host.protocol!=='http:'||!['localhost','127.0.0.1','::1'].includes(host.hostname))
 throw Error('SEGURIDAD: se prohíbe probar contra URLs remotas')
const company='11111111-1111-4111-8111-111111111111'
const companyB='22222222-2222-4222-8222-222222222222'
const invA='a1111111-1111-4111-8111-111111111111'
const invB='b2222222-2222-4222-8222-222222222222'
const bucket='prestaditos-portal-receipts'
const secret='LocalTest-1234567-NotReal'
const emailA='investor-a-auth-qa@example.invalid',emailB='investor-b-auth-qa@example.invalid'
const client=key=>createClient(API_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
const root=client(SERVICE_ROLE_KEY),a=client(ANON_KEY),b=client(ANON_KEY),owner=client(ANON_KEY),ownerB=client(ANON_KEY),staff=client(ANON_KEY)
const anonymous=client(ANON_KEY)
let passed=0
function check(ok,name){assert.ok(ok,'FALLÓ: '+name);passed++;console.log('PASS · '+name)}
function success(result,name){
 if(result.error)throw Error(name+': '+result.error.message)
 passed++;console.log('PASS · '+name);return result.data
}
async function denied(promise,name){
 const result=await promise
 check(!!result.error,name+' (acceso denegado)')
}
function execSql(command){
 return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-tA','-c',command],
 {encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe']}).trim()
}
async function provision(email){
 const data=success(await root.auth.admin.createUser({email,password:secret,email_confirm:true}),'Alta Auth '+email)
 const id=data.user.id
 check(/^[a-f0-9-]{36}$/i.test(id),'UUID real de Auth')
 return id
}
async function signin(api,email,name){
 await denied(api.auth.signInWithPassword({email,password:'Wrong-Password-789'}),name+' no admite contraseña falsa')
 const d=success(await api.auth.signInWithPassword({email,password:secret}),name+' inicia sesión con GoTrue')
 check(Boolean(d.session?.access_token),name+' obtiene JWT')
 check((await api.auth.getUser()).data.user?.email===email,name+' token identifica correo correcto')
}
async function main(){
 const ids={
  a:await provision(emailA),b:await provision(emailB),
  owner:await provision('owner-auth-qa@example.invalid'),
  ownerB:await provision('other-owner-auth-qa@example.invalid'),
  staff:await provision('staff-auth-qa@example.invalid')
 }
 // These UUIDs came only from local GoTrue. Validated, never sourced from a user.
 for(const id of Object.values(ids))assert.match(id,/^[0-9a-f-]{36}$/i)
 execSql("insert into public.company_members(company_id,user_id,role) values"+
  "('"+company+"','"+ids.owner+"','owner'),"+
  "('"+companyB+"','"+ids.ownerB+"','owner'),"+
  "('"+company+"','"+ids.staff+"','staff')")
 execSql("update public.saas_company_subscriptions set vertical_id=(select id from public.saas_verticals where code='FINANCIAL_INVESTORS')")
 execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-f','supabase/tests/prestaditos_ephemeral_seed.sql'],
  {env:process.env,stdio:['ignore','pipe','pipe']})
 execSql("update public.inv_investors set email='"+emailA+"' where id='"+invA+"'")
 execSql("update public.inv_investors set email='"+emailB+"' where id='"+invB+"'")
 await signin(a,emailA,'inversionista A')
 await signin(b,emailB,'inversionista B')
 await signin(owner,'owner-auth-qa@example.invalid','administrador A')
 await signin(ownerB,'other-owner-auth-qa@example.invalid','administrador de otra empresa')
 await signin(staff,'staff-auth-qa@example.invalid','empleado sin rol administrativo')
 const created=success(await anonymous.auth.signUp({email:'signup-new-qa@example.invalid',password:secret}),
   'Registro real de nueva cuenta')
 check(Boolean(created.user),'signup devuelve una cuenta de prueba')
 await denied(anonymous.rpc('inv_portal_dashboard',{p_company:company}),
   'Una cuenta nueva sin aprobación no ve balances')
 const guest=client(ANON_KEY)
 await denied(guest.from('inv_portal_enrollments').select('*'),'Invitado anónimo no consulta inscripciones')
 await denied(a.rpc('inv_portal_dashboard',{p_company:company}),'A sin aprobación no consulta inversiones')
 const enrollmentA=success(await a.from('inv_portal_enrollments').insert({
   company_id:company,user_id:ids.a,full_name:'Ana Ficticia',dui:'90000001-1',
   phone:'70000001',email:emailA
 }).select('id').single(),'A solicita acceso mediante API de Supabase')
 const enrollmentB=success(await b.from('inv_portal_enrollments').insert({
   company_id:company,user_id:ids.b,full_name:'Beto Ficticio',dui:'90000002-2',
   phone:'70000002',email:emailB
 }).select('id').single(),'B solicita acceso mediante API de Supabase')
 await denied(a.from('inv_portal_enrollments').insert({
   company_id:company,user_id:ids.b,full_name:'Suplantación QA',dui:'90000002-2',
   phone:'70000001',email:emailA
 }),'A no registra en nombre de B')
 await denied(a.rpc('inv_portal_link_account',{p_enrollment:enrollmentA.id,p_investor:invA}),
 'A no puede aprobar su propia identidad')
 await denied(staff.rpc('inv_portal_link_account',{p_enrollment:enrollmentA.id,p_investor:invA}),
 'Empleado no puede aprobar identidades')
 await denied(ownerB.rpc('inv_portal_link_account',{p_enrollment:enrollmentA.id,p_investor:invA}),
 'Administrador de otra empresa no aprueba identidad')
 success(await owner.rpc('inv_portal_link_account',{p_enrollment:enrollmentA.id,p_investor:invA}),
  'Administrador verificado vincula expediente A')
 success(await owner.rpc('inv_portal_link_account',{p_enrollment:enrollmentB.id,p_investor:invB}),
  'Administrador verificado vincula expediente B')
 const dA=success(await a.rpc('inv_portal_dashboard',{p_company:company}),'A accede a balances con JWT')
 const dB=success(await b.rpc('inv_portal_dashboard',{p_company:company}),'B accede a balances con JWT')
 check(dA.investor.id===invA && dA.investments.length===1,'A solo consulta sus inversiones')
 check(dB.investor.id===invB && dB.investments.length===1,'B solo consulta sus inversiones')
 await denied(a.rpc('inv_portal_dashboard',{p_company:companyB}),'A no ve otra empresa')
 const raw=await a.from('inv_payments').select('id')
 check(!raw.error && (raw.data||[]).length===0,'A no consulta pagos financieros directamente')
 const app=success(await a.rpc('inv_portal_submit_application',{
   p_company:company,p_amount:450,p_months:12,p_start:new Date().toISOString().slice(0,10),
   p_method:'Transferencia bancaria',p_place:'QA',p_notes:'Dinero completamente ficticio'
 }), 'Solicitud de inversión entra al ERP real')
 const applicationId=typeof app==='string'?app:app?.id
 assert.match(applicationId,/^[0-9a-f-]{36}$/i)
 const path=[company,ids.a,applicationId,'comprobante.pdf'].join('/')
 const content=Buffer.from('%PDF-1.7\nPrestaditos QA no real\n%%EOF\n')
 await denied(b.storage.from(bucket).upload(path,content,{contentType:'application/pdf'}),
 'B no puede escribir archivos en la carpeta de A')
 await denied(a.storage.from(bucket).upload([company,ids.b,applicationId,'falso.pdf'].join('/'),
 content,{contentType:'application/pdf'}),'A no falsifica ruta de B')
 success(await a.storage.from(bucket).upload(path,content,{contentType:'application/pdf',upsert:false}),
 'Storage acepta comprobante PDF de A')
 await denied(a.storage.from(bucket).upload([company,ids.a,applicationId,'html.html'].join('/'),
  Buffer.from('<script>fake</script>'),{contentType:'text/html'}),
 'Storage rechaza contenido HTML')
 await denied(a.storage.from(bucket).upload([company,ids.a,applicationId,'large.pdf'].join('/'),
  Buffer.alloc(5*1024*1024+1,65),{contentType:'application/pdf'}),
 'Storage rechaza archivo mayor a 5 MiB')
 await denied(b.storage.from(bucket).createSignedUrl(path,60),'B no firma URL de comprobante A')
 await denied(ownerB.storage.from(bucket).createSignedUrl(path,60),'Administrador externo no firma comprobante A')
 await denied(staff.storage.from(bucket).createSignedUrl(path,60),'Empleado sin autorización no firma comprobante A')
 await denied(guest.storage.from(bucket).download(path),'Invitado no descarga comprobante privado')
 const signed=success(await a.storage.from(bucket).createSignedUrl(path,60),'A firma URL temporal de comprobante')
 check(Boolean(signed.signedUrl),'URL temporal generada')
 const file=success(await a.storage.from(bucket).download(path),'A descarga su propio PDF')
 check(Buffer.from(await file.arrayBuffer()).equals(content),'Integridad del PDF almacenado')
 success(await owner.storage.from(bucket).createSignedUrl(path,60),
 'Administrador financiero firma comprobante A')
 success(await a.rpc('inv_portal_attach_receipt',{p_application:applicationId,p_path:path}),
 'Comprobante queda vinculado al expediente del ERP')
 await denied(a.rpc('inv_portal_attach_receipt',{p_application:applicationId,p_path:path}),
 'No se sobrescribe comprobante ya vinculado')
 const dAfter=success(await b.rpc('inv_portal_dashboard',{p_company:company}),
 'B mantiene acceso propio al ERP')
 check(dAfter.applications.length===0,'B no ve solicitud ni documento de A')
 execSql("update public.inv_investors set status='BLOCKED' where id='"+invA+"'")
 await denied(a.rpc('inv_portal_dashboard',{p_company:company}),
 'Bloquear A revoca balance aunque JWT no expire')
 await denied(a.storage.from(bucket).createSignedUrl(path,60),
 'Bloquear A impide firmar otra URL de comprobante')
 success(await b.rpc('inv_portal_dashboard',{p_company:company}),
 'B conserva acceso después de bloquear A')
 success(await b.auth.signOut(),'B cierra sesión con Auth')
 await denied(b.rpc('inv_portal_dashboard',{p_company:company}),
 'B sin sesión deja de consultar el portal')
 console.log('E2E AUTH + STORAGE REAL COMPLETADO: '+passed+' verificaciones, sin producción.')
}
main().catch(e=>{console.error('FALLÓ E2E QA LOCAL: '+e.message);process.exitCode=1})
