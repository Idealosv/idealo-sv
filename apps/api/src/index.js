import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { getSupabaseAdmin, isSupabaseConfigured } from './lib/supabase.js'
import { getDteConfigurationStatus, getDteProductionPreflightStatus } from './dte/config.js'
import { createTestDteDraft } from './dte/draft-service.js'
import { createInvoiceDraft } from './dte/invoice-service.js'
import { signTestDteDraft, signProductionDteDraft } from './dte/sign-service.js'
import { transmitSignedTestDte } from './dte/transmit-test-service.js'
import { transmitSignedProductionDte } from './dte/transmit-production-service.js'
import { invalidateProcessedDte, reportDteContingency } from './dte/fiscal-event-service.js'
import { diagnoseDteSigner } from './dte/signer-diagnostic-service.js'
import { diagnoseMhAuthentication } from './dte/mh-auth-diagnostic-service.js'
import { getRuntimeSettings, updateRuntimeSettings } from './dte/runtime-settings-service.js'
import { sendGmailSelfTest } from './dte/gmail-test-service.js'
import { sendInvoicePdfSelfTest } from './dte/invoice-email-preview-service.js'
import { getInvoiceEmailStatus, resendInvoiceEmail } from './dte/invoice-email-management-service.js'
import { listCompanyUsers, inviteCompanyUser, updateCompanyUserRole, revokeCompanyUser, listCompanyAdminAudit, registerCompanyActivity } from './admin/user-administration-service.js'
import { getSaasMasterDashboard, createSaasCompany, updateSaasSubscription, createSaasBillingEvent } from './admin/saas-master-service.js'
import { recordSecurityAuditEvent } from './security/security-audit-service.js'
import { getAiStatus, getAiSnapshot, askAiAssistant } from './ai/assistant-service.js'

const app=express();const port=Number(process.env.PORT||4000)
const configuredOrigins=(process.env.CORS_ORIGIN||'').split(',').map(v=>v.trim()).filter(Boolean)
if(process.env.NODE_ENV==='production'&&configuredOrigins.length===0)throw new Error('CORS_ORIGIN es obligatoria en producción; la API no iniciará con CORS abierto.')
app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet());app.use(cors({origin:configuredOrigins.length?configuredOrigins:true,credentials:true}));app.use(express.json({limit:'1mb'}))
const db=()=>getSupabaseAdmin()
app.get('/',(_q,r)=>r.json({name:'IDEALO SV API',version:'0.1.0'}));app.get('/health',(_q,r)=>r.json({status:'ok',service:'idealo-sv-api',supabase:isSupabaseConfigured?'configured':'pending',timestamp:new Date().toISOString()}))
app.get('/api/system/status',async(_q,r,n)=>{try{const {error}=await db().from('companies').select('id').limit(1);if(error)throw error;r.json({api:'ok',database:'ok',dte:getDteConfigurationStatus()})}catch(e){n(e)}})
app.get('/api/ai/status',async(_q,r,n)=>{try{r.json(await getAiStatus())}catch(e){n(e)}})
app.get('/api/ai/snapshot',async(q,r,n)=>{try{r.json(await getAiSnapshot({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/ai/ask',async(q,r)=>{try{r.json(await askAiAssistant({request:q,supabase:db()}))}catch(e){console.error('AI_ASSISTANT_FAILED',{code:e?.code,statusCode:e?.statusCode,message:e?.message});const s=Number(e?.statusCode||500);r.status(s).json({error:String(e?.code||'AI_ASSISTANT_ERROR'),code:String(e?.code||'AI_ASSISTANT_ERROR'),message:String(e?.message||'No se pudo completar el análisis interno.')})}})
app.get('/api/admin/users',async(q,r,n)=>{try{r.json(await listCompanyUsers({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/admin/users/invite',async(q,r,n)=>{try{r.status(201).json(await inviteCompanyUser({request:q,supabase:db()}))}catch(e){n(e)}})
app.patch('/api/admin/users/:userId',async(q,r,n)=>{try{r.json(await updateCompanyUserRole({request:q,supabase:db()}))}catch(e){n(e)}})
app.delete('/api/admin/users/:userId',async(q,r,n)=>{try{r.json(await revokeCompanyUser({request:q,supabase:db()}))}catch(e){n(e)}})
app.get('/api/admin/audit',async(q,r,n)=>{try{r.json(await listCompanyAdminAudit({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/activity',async(q,r,n)=>{try{r.status(201).json(await registerCompanyActivity({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/security/audit',async(q,r,n)=>{try{r.status(201).json(await recordSecurityAuditEvent({request:q,supabase:db()}))}catch(e){n(e)}})
app.get('/api/admin/saas/dashboard',async(q,r,n)=>{try{r.json(await getSaasMasterDashboard({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/admin/saas/companies',async(q,r,n)=>{try{r.status(201).json(await createSaasCompany({request:q,supabase:db()}))}catch(e){n(e)}})
app.patch('/api/admin/saas/companies/:companyId/subscription',async(q,r,n)=>{try{r.json(await updateSaasSubscription({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/admin/saas/companies/:companyId/payments',async(q,r,n)=>{try{r.status(201).json(await createSaasBillingEvent({request:q,supabase:db()}))}catch(e){n(e)}})
app.get('/api/dte/status',(_q,r)=>r.json(getDteConfigurationStatus()));app.get('/api/dte/production-preflight',(_q,r)=>r.json(getDteProductionPreflightStatus()))
app.get('/api/dte/runtime-settings',async(q,r,n)=>{try{r.json(await getRuntimeSettings({request:q,supabase:db()}))}catch(e){n(e)}})
app.put('/api/dte/runtime-settings',async(q,r,n)=>{try{r.json(await updateRuntimeSettings({request:q,supabase:db()}))}catch(e){n(e)}})
app.get('/api/dte/mh-auth-diagnostic',async(q,r,n)=>{try{r.json(await diagnoseMhAuthentication({request:q,supabase:db()}))}catch(e){n(e)}})
app.get('/api/dte/signer-diagnostic',async(q,r,n)=>{try{r.json(await diagnoseDteSigner({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/gmail-test',async(q,r)=>{try{r.json(await sendGmailSelfTest({request:q,supabase:db()}))}catch(e){console.error('GMAIL_TEST_FAILED',{code:e?.code,statusCode:e?.statusCode,message:e?.message});r.status(Number(e?.statusCode||502)).json({error:'GMAIL_TEST_FAILED',code:String(e?.code||'GMAIL_ERROR'),message:String(e?.message||'No se pudo completar la prueba de Gmail.')})}})
app.post('/api/dte/invoice-email-self-test',async(q,r)=>{try{r.json(await sendInvoicePdfSelfTest({request:q,supabase:db()}))}catch(e){console.error('INVOICE_PDF_SELF_TEST_FAILED',{stage:e?.stage,code:e?.code,statusCode:e?.statusCode,message:e?.message});r.status(Number(e?.statusCode||502)).json({error:'INVOICE_PDF_SELF_TEST_FAILED',stage:String(e?.stage||'unknown'),code:String(e?.code||'PDF_EMAIL_TEST_FAILED'),message:String(e?.message||'No se pudo completar la prueba PDF por Gmail.')})}})
app.get('/api/dte/invoice-email-status',async(q,r,n)=>{try{r.json(await getInvoiceEmailStatus({request:q,supabase:db()}))}catch(e){n(e)}});app.post('/api/dte/invoice-email-resend',async(q,r,n)=>{try{r.json(await resendInvoiceEmail({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/drafts',async(q,r,n)=>{try{r.status(201).json(await createTestDteDraft({request:q,supabase:db()}))}catch(e){n(e)}});app.post('/api/dte/invoices',async(q,r,n)=>{try{r.status(201).json(await createInvoiceDraft({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/sign-test',async(q,r,n)=>{try{r.json(await signTestDteDraft({request:q,supabase:db()}))}catch(e){n(e)}});app.post('/api/dte/sign-production',async(q,r,n)=>{try{r.json(await signProductionDteDraft({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/transmit-test',async(q,r,n)=>{try{r.json(await transmitSignedTestDte({request:q,supabase:db()}))}catch(e){n(e)}});app.post('/api/dte/transmit-production',async(q,r,n)=>{try{r.json(await transmitSignedProductionDte({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/invalidate',async(q,r,n)=>{try{r.json(await invalidateProcessedDte({request:q,supabase:db()}))}catch(e){n(e)}})
app.post('/api/dte/contingency-event',async(q,r,n)=>{try{r.json(await reportDteContingency({request:q,supabase:db()}))}catch(e){n(e)}})
app.use((e,_q,r,_n)=>{console.error(e);const s=Number(e.statusCode||500);r.status(s).json({error:s>=500?'INTERNAL_SERVER_ERROR':(e.code||'REQUEST_ERROR'),message:s>=500&&process.env.NODE_ENV==='production'?'Ocurrió un error inesperado.':e.message})})
app.listen(port,'0.0.0.0',()=>console.log(`IDEALO SV API disponible en el puerto ${port}`));export{app}
