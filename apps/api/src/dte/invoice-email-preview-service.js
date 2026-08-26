import nodemailer from 'nodemailer'
import { buildInvoiceEmailWithPdf } from './invoice-email-service.js'

const text = (value) => String(value ?? '').trim()

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
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
      })

  try {
    const message = await buildInvoiceEmailWithPdf(document)
    const sent = await transporter.sendMail({
      from: { name: config.fromName, address: config.user },
      to: config.user,
      replyTo: config.user,
      subject: `[PRUEBA PDF] ${message.subject}`,
      html: `<div style="padding:12px;border:2px solid #f97316;font-family:Arial,sans-serif"><strong>PRUEBA INTERNA IDEALO SV</strong><p>Este envío usa un DTE ya almacenado. No genera, firma ni transmite ningún documento nuevo a Hacienda.</p></div>${message.html}`,
      attachments: message.attachments,
    })

    return {
      ok: true,
      recipient: config.user,
      messageId: text(sent?.messageId) || null,
      documentId: document.id,
      controlNumber: document.control_number,
      sourceEnvironment: document.environment,
      pdfAttached: true,
      fiscalDocumentTouched: false,
      transmittedToMh: false,
      sentAt: new Date().toISOString(),
    }
  } finally {
    if (!transporterFactory && typeof transporter.close === 'function') transporter.close()
  }
}
