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

function normalizeSelfTestError(error) {
  if (error?.statusCode) return error
  const code = text(error?.code || error?.responseCode)
  const detail = text(error?.response || error?.message)
  const message = code === 'EAUTH' || String(error?.responseCode) === '535'
    ? 'Gmail rechazó la autenticación. Revisá el usuario SMTP y la contraseña de aplicación en Render.'
    : `No se pudo enviar la prueba PDF${code ? ` (${code})` : ''}${detail ? `: ${detail}` : '.'}`
  const normalized = new Error(message)
  normalized.statusCode = 502
  normalized.code = code || 'PDF_EMAIL_TEST_FAILED'
  return normalized
}

export async function sendInvoicePdfSelfTest({ request, supabase, env = process.env, transporterFactory }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para enviar la prueba.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

  const documentId = text(request.body?.documentId)
  if (!documentId) {
    const error = new Error('Debes seleccionar un DTE.')
    error.statusCode = 400
    throw error
  }

  const { data: document, error: documentError } = await supabase
    .from('dte_documents')
    .select('id, company_id, dte_type, control_number, generation_code, environment, status, dte_payload, signed_document, mh_response')
    .eq('id', documentId)
    .maybeSingle()
  if (documentError) throw documentError
  if (!document) {
    const error = new Error('No se encontró el DTE seleccionado.')
    error.statusCode = 404
    throw error
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', document.company_id)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para usar este DTE.')
    error.statusCode = 403
    throw error
  }

  if (document.status !== 'PROCESSED' || !receiptSeal(document.mh_response)) {
    const error = new Error('La prueba con PDF solo está disponible para un DTE aceptado por Hacienda y con sello de recepción.')
    error.statusCode = 409
    throw error
  }

  const config = gmailConfig(env)
  if (!config.user || !config.appPassword) {
    const error = new Error('Gmail no está configurado en el backend.')
    error.statusCode = 503
    throw error
  }

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
    // La prueba básica de Gmail ya verifica credenciales. Aquí evitamos abrir una
    // segunda conexión SMTP con transporter.verify(), porque en algunos hosts
    // esa doble conexión puede terminar cerrada por el proxy y el navegador
    // solo recibe "Failed to fetch".
    const message = await buildInvoiceEmailWithPdf(document)
    const pdfAttachment = message.attachments.find((attachment) => attachment.contentType === 'application/pdf')
    if (!pdfAttachment?.content) {
      const error = new Error('No se pudo generar la representación gráfica PDF del DTE.')
      error.statusCode = 500
      throw error
    }

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
    throw normalizeSelfTestError(error)
  } finally {
    if (!transporterFactory && typeof transporter.close === 'function') transporter.close()
  }
}
