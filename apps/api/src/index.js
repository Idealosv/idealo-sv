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
import { diagnoseDteSigner } from './dte/signer-diagnostic-service.js'
import { diagnoseMhAuthentication } from './dte/mh-auth-diagnostic-service.js'

const app = express()
const port = Number(process.env.PORT || 4000)
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean)
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGIN es obligatoria en producción; la API no iniciará con CORS abierto.')
}

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: configuredOrigins.length ? configuredOrigins : true,
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))

app.get('/', (_request, response) => {
  response.json({ name: 'IDEALO SV API', version: '0.1.0' })
})

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'idealo-sv-api',
    supabase: isSupabaseConfigured ? 'configured' : 'pending',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/system/status', async (_request, response, next) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('companies').select('id').limit(1)
    if (error) throw error
    response.json({ api: 'ok', database: 'ok', dte: getDteConfigurationStatus() })
  } catch (error) {
    next(error)
  }
})

app.get('/api/dte/status', (_request, response) => {
  response.json(getDteConfigurationStatus())
})

app.get('/api/dte/production-preflight', (_request, response) => {
  response.json(getDteProductionPreflightStatus())
})

app.get('/api/dte/mh-auth-diagnostic', async (request, response, next) => {
  try {
    const diagnostic = await diagnoseMhAuthentication({ request, supabase: getSupabaseAdmin() })
    response.json(diagnostic)
  } catch (error) {
    next(error)
  }
})

app.get('/api/dte/signer-diagnostic', async (request, response, next) => {
  try {
    const diagnostic = await diagnoseDteSigner({ request, supabase: getSupabaseAdmin() })
    response.json(diagnostic)
  } catch (error) {
    next(error)
  }
})

app.post('/api/dte/drafts', async (request, response, next) => {
  try {
    const draft = await createTestDteDraft({ request, supabase: getSupabaseAdmin() })
    response.status(201).json(draft)
  } catch (error) {
    next(error)
  }
})

app.post('/api/dte/invoices', async (request, response, next) => {
  try {
    const draft = await createInvoiceDraft({ request, supabase: getSupabaseAdmin() })
    response.status(201).json(draft)
  } catch (error) {
    next(error)
  }
})

app.post('/api/dte/sign-test', async (request, response, next) => {
  try {
    const signed = await signTestDteDraft({ request, supabase: getSupabaseAdmin() })
    response.json(signed)
  } catch (error) {
    next(error)
  }
})

app.post('/api/dte/transmit-test', async (request, response, next) => {
  try {
    const result = await transmitSignedTestDte({ request, supabase: getSupabaseAdmin() })
    response.json(result)
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error(error)
  const status = Number(error.statusCode || 500)
  response.status(status).json({
    error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
    message: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Ocurrió un error inesperado.'
      : error.message,
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`IDEALO SV API disponible en el puerto ${port}`)
})

export { app }
