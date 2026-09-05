import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { getSupabaseAdmin, isSupabaseConfigured } from './lib/supabase.js'
import { getDteConfigurationStatus, getDteProductionPreflightStatus } from './dte/config.js'
import { createTestDteDraft } from './dte/draft-service.js'
import { createInvoiceDraft } from './dte/invoice-service.js'
import { signTestDteDraft } from './dte/sign-service.js'
import { transmitSignedTestDte } from './dte/transmit-test-service.js'
import { transmitSignedProductionDte } from './dte/transmit-production-service.js'
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

const app = express()
const port = Number(process.env.PORT || 4000)
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean)
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) throw new Error('CORS_ORIGIN es obligatoria en producción; la API no iniciará con CORS abierto.')

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: configuredOrigins.length ? configuredOrigins : true, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.get('/', (_request, response) => response.json({ name: 'IDEALO SV API', version: '0.1.0' }))
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'idealo-sv-api', supabase: isSupabaseConfigured ? 'configured' : 'pending', timestamp: new Date().toISOString() }))

app.get('/api/system/status', async (_request, response, next) => {
  try { const supabase = getSupabaseAdmin(); const { error } = await supabase.from('companies').select('id').limit(1); if (error) throw error; response.json({ api: 'ok', database: 'ok', dte: getDteConfigurationStatus() }) } catch (error) { next(error) }
})

app.get('/api/ai/status', async (_request, response, next) => {
  try { response.json(await getAiStatus()) } catch (error) { next(error) }
})
app.get('/api/ai/snapshot', async (request, response, next) => {
  try { response.json(await getAiSnapshot({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/ai/ask', async (request, response) => {
  try { response.json(await askAiAssistant({ request, supabase: getSupabaseAdmin() })) }
  catch (error) {
    console.error('AI_ASSISTANT_FAILED', { code: error?.code, statusCode: error?.statusCode, message: error?.message })
    const status = Number(error?.statusCode || 500)
    response.status(status).json({
      error: String(error?.code || 'AI_ASSISTANT_ERROR'),
      code: String(error?.code || 'AI_ASSISTANT_ERROR'),
      message: String(error?.message || 'No se pudo completar el análisis interno.')
    })
  }
})

app.get('/api/admin/users', async (request, response, next) => {
  try { response.json(await listCompanyUsers({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/admin/users/invite', async (request, response, next) => {
  try { response.status(201).json(await inviteCompanyUser({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.patch('/api/admin/users/:userId', async (request, response, next) => {
  try { response.json(await updateCompanyUserRole({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.delete('/api/admin/users/:userId', async (request, response, next) => {
  try { response.json(await revokeCompanyUser({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.get('/api/admin/audit', async (request, response, next) => {
  try { response.json(await listCompanyAdminAudit({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/activity', async (request, response, next) => {
  try { response.status(201).json(await registerCompanyActivity({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/security/audit', async (request, response, next) => {
  try { response.status(201).json(await recordSecurityAuditEvent({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.get('/api/admin/saas/dashboard', async (request, response, next) => {
  try { response.json(await getSaasMasterDashboard({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/admin/saas/companies', async (request, response, next) => {
  try { response.status(201).json(await createSaasCompany({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.patch('/api/admin/saas/companies/:companyId/subscription', async (request, response, next) => {
  try { response.json(await updateSaasSubscription({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/admin/saas/companies/:companyId/payments', async (request, response, next) => {
  try { response.status(201).json(await createSaasBillingEvent({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})

app.get('/api/dte/status', (_request, response) => response.json(getDteConfigurationStatus()))
app.get('/api/dte/production-preflight', (_request, response) => response.json(getDteProductionPreflightStatus()))
app.get('/api/dte/runtime-settings', async (request, response, next) => {
  try { response.json(await getRuntimeSettings({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.put('/api/dte/runtime-settings', async (request, response, next) => {
  try { response.json(await updateRuntimeSettings({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.get('/api/dte/mh-auth-diagnostic', async (request, response, next) => {
  try { response.json(await diagnoseMhAuthentication({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.get('/api/dte/signer-diagnostic', async (request, response, next) => {
  try { response.json(await diagnoseDteSigner({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/gmail-test', async (request, response) => {
  try { response.json(await sendGmailSelfTest({ request, supabase: getSupabaseAdmin() })) }
  catch (error) {
    console.error('GMAIL_TEST_FAILED', { code: error?.code, statusCode: error?.statusCode, message: error?.message })
    const status = Number(error?.statusCode || 502)
    response.status(status).json({ error: 'GMAIL_TEST_FAILED', code: String(error?.code || 'GMAIL_ERROR'), message: String(error?.message || 'No se pudo completar la prueba de Gmail.') })
  }
})
app.post('/api/dte/invoice-email-self-test', async (request, response) => {
  try { response.json(await sendInvoicePdfSelfTest({ request, supabase: getSupabaseAdmin() })) }
  catch (error) {
    console.error('INVOICE_PDF_SELF_TEST_FAILED', { stage: error?.stage, code: error?.code, statusCode: error?.statusCode, message: error?.message })
    const status = Number(error?.statusCode || 502)
    response.status(status).json({ error: 'INVOICE_PDF_SELF_TEST_FAILED', stage: String(error?.stage || 'unknown'), code: String(error?.code || 'PDF_EMAIL_TEST_FAILED'), message: String(error?.message || 'No se pudo completar la prueba PDF por Gmail.') })
  }
})
app.get('/api/dte/invoice-email-status', async (request, response, next) => {
  try { response.json(await getInvoiceEmailStatus({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/invoice-email-resend', async (request, response, next) => {
  try { response.json(await resendInvoiceEmail({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/drafts', async (request, response, next) => {
  try { response.status(201).json(await createTestDteDraft({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/invoices', async (request, response, next) => {
  try { response.status(201).json(await createInvoiceDraft({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/sign-test', async (request, response, next) => {
  try { response.json(await signTestDteDraft({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/transmit-test', async (request, response, next) => {
  try { response.json(await transmitSignedTestDte({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})
app.post('/api/dte/transmit-production', async (request, response, next) => {
  try { response.json(await transmitSignedProductionDte({ request, supabase: getSupabaseAdmin() })) } catch (error) { next(error) }
})

app.use((error, _request, response, _next) => {
  console.error(error)
  const status = Number(error.statusCode || 500)
  response.status(status).json({ error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : (error.code || 'REQUEST_ERROR'), message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Ocurrió un error inesperado.' : error.message })
})
app.listen(port, '0.0.0.0', () => console.log(`IDEALO SV API disponible en el puerto ${port}`))
export { app }
