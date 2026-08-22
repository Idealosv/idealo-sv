import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { getSupabaseAdmin, isSupabaseConfigured } from './lib/supabase.js'
import { getDteConfigurationStatus } from './dte/config.js'

const app = express()
const port = Number(process.env.PORT || 4000)

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) || true,
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

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Ocurrió un error inesperado.'
      : error.message,
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`IDEALO SV API disponible en el puerto ${port}`)
})

export { app }
