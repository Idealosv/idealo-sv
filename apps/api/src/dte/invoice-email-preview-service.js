import nodemailer from 'nodemailer'
import { buildInvoiceEmailWithPdf } from './invoice-email-service.js'

const text = (value) => String(value ?? '').trim()
const GMAIL_TIMEOUT_MS = 20_000

function bearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function gmailConfig(env) {
  return {
    user: text(env.GMAIL_SMTP_USER).toLowerCase(),
    appPassword: text(env.GMAIL_APP_PASSWORD).replace(/\s+/g, ''),
    fromName: text(env.GMAIL_FROM_NAME || 'IDEALO SV - Facturación'),
  }
}

function receiptSeal(response) {
  const body = response?.body || response || {}
  return text(body.selloRecibido || body.selloRecepcion || body.sello || '')
}

function withTimeout(promise, label, timeoutMs = GMAIL_TIMEOUT_MS) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} tardó más de ${Math.round(timeoutMs / 1000)} segundos. Gmail no respondió a tiempo.`)
      error.statusCode = 504
      error.code = 'GMAIL_TIMEOUT'
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function stagedError(stage, error, fallback, statusCode = 500) {
  const wrapped = error instanceof Error ? error : new Error(fallback)
  if (!text(wrapped.message)) wrapped.message = fallback
  wrapped.stage = stage
  wrapped.statusCode = Number(wrapped.statusCode || statusCode)
  return wrapped
}

function normalizeSelfTestError(error, stage = error?.stage || 'smtp') {
  if (error?.statusCode && error?.stage) return error
  const code = text(error?.code || error?.responseCode)
  const detail = text(error?.response || error?.message)
  const message = code === 'EAUTH' || String(error?.responseCode) === '535'
    ? 'Gmail rechazó la autenticación. Revisá el usuario SMTP y la contraseña de aplicación en Render.'
    : `No se pudo enviar la prueba PDF${code ? ` (${code})` : ''}${detail ? `: ${detail}` : '.'}`
  const normalized = new Error(message)
  normalized.statusCode = Number(error?.statusCode || 502)
  normalized.code = code || 'PDF_EMAIL_TEST_FAILED'
  normalized.stage = stage
  return normalized
}

export async function sendInvoicePdfSelfTest({ request, supabase, env = process.env, transporterFactory }) {
  const token = bearerToken(request)
  if (!token) throw stagedError('session', null, 'Debes iniciar sesión para enviar la prueba.', 401)

  let userData
  try {
    const result = await supabase.auth.getUser(token)
    userData = result.data
    if (result.error || !userData?.user) throw result.error || new Error('Sesión inválida')
  } catch (error) {
    throw stagedError('session', error, 'La sesión no es válida o ya venció.', 401)
  }

  const documentId = text(request.body?.documentId)
  if (!documentId) throw stagedError('document', null, 'Debes seleccionar un DTE.', 400)

  let document
  try {
    const result = await supabase
      .from('dte_documents')
      .select('id, company_id, dte_type, control_number, generation_code, environment, status, dte_payload, signed_document, mh_response')
      .eq('id', documentId)
      .maybeSingle()
    if (result.error) throw result.error
    document = result.data
  } catch (error) {
    throw stagedError('document', error, 'No se pudo leer el DTE seleccionado.', 500)
  }
  if (!document) throw stagedError('document', null, 'No se encontró el DTE seleccionado.', 404)

  let membership
  try {
    const result = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', document.company_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (result.error) throw result.error
    membership = result.data
  } catch (error) {
    throw stagedError('permissions', error, 'No se pudieron comprobar los permisos de la empresa.', 500)
  }
  if (!membership) throw stagedError('permissions', null, 'No tienes permiso para usar este DTE.', 403)

  if (document.status !== 'PROCESSED' || !receiptSeal(document.mh_response)) {
    throw stagedError('document', null, 'La prueba con PDF solo está disponible para un DTE aceptado por Hacienda y con sello de recepción.', 409)
  }

  const config = gmailConfig(env)
  if (!config.user || !config.appPassword) throw stagedError('gmail-config', null, 'Gmail no está configurado en el backend.', 503)

  let message
  try {
    message = await buildInvoiceEmailWithPdf(document)
  } catch (error) {
    throw stagedError('pdf', error, 'No se pudo generar la representación gráfica PDF del DTE.', 500)
  }
  const pdfAttachment = message.attachments.find((attachment) => attachment.contentType === 'application/pdf')
  if (!pdfAttachment?.content) throw stagedError('pdf', null, 'No se pudo generar la representación gráfica PDF del DTE.', 500)

  const transporter = transporterFactory
    ? transporterFactory(config)
    : nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.appPassword },
        pool: false,
        connectionTimeout: GMAIL_TIMEOUT_MS,
        greetingTimeout: GMAIL_TIMEOUT_MS,
        socketTimeout: GMAIL_TIMEOUT_MS,
      })

  try {
    const sent = await withTimeout(transporter.sendMail({
      from: { name: config.fromName, address: config.user },
      to: config.user,
      replyTo: config.user,
      subject: `[PRUEBA PDF] ${message.subject}`,
      html: `<div style="padding:12px;border:2px solid #f97316;font-family:Arial,sans-serif"><strong>PRUEBA INTERNA IDEALO SV</strong><p>Este envío usa un DTE ya almacenado y adjunta únicamente su representación gráfica PDF. No genera, firma ni transmite ningún documento nuevo a Hacienda.</p></div>${message.html}`,
      attachments: [pdfAttachment],
    }), 'El envío del PDF de prueba')

    return {
      ok: true,
      recipient: config.user,
      messageId: text(sent?.messageId) || null,
      documentId: document.id,
      controlNumber: document.control_number,
      sourceEnvironment: document.environment,
      pdfAttached: true,
      attachmentCount: 1,
      fiscalDocumentTouched: false,
      transmittedToMh: false,
      sentAt: new Date().toISOString(),
    }
  } catch (error) {
    throw normalizeSelfTestError(error, 'smtp')
  } finally {
    if (!transporterFactory && typeof transporter.close === 'function') transporter.close()
  }
}
