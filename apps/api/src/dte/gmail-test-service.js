import nodemailer from 'nodemailer'

const text = (value) => String(value ?? '').trim()
const testCooldowns = new Map()
const GMAIL_TIMEOUT_MS = 15_000

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

function normalizeGmailError(error) {
  if (error?.code === 'GMAIL_TIMEOUT') return error
  const code = text(error?.code || error?.responseCode)
  const detail = text(error?.response || error?.message)
  const normalized = new Error(
    code === 'EAUTH' || String(error?.responseCode) === '535'
      ? 'Gmail rechazó la autenticación. Revisá GMAIL_SMTP_USER y la contraseña de aplicación en Render.'
      : `No se pudo completar la prueba de Gmail${code ? ` (${code})` : ''}${detail ? `: ${detail}` : '.'}`,
  )
  normalized.statusCode = 502
  normalized.code = code || 'GMAIL_ERROR'
  return normalized
}

export function buildGmailTestMessage({ fromName = 'IDEALO SV - Facturación', recipient }) {
  return {
    subject: 'Prueba de correo IDEALO SV',
    text: 'La conexión de Gmail con IDEALO SV funciona correctamente. Esta prueba no genera, firma ni transmite ningún DTE al Ministerio de Hacienda.',
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202124;line-height:1.5"><div style="max-width:640px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden"><div style="background:#15181c;color:white;padding:20px 24px"><strong style="color:#ff6a00">IDEALO SV</strong><br><span>Prueba de correo</span></div><div style="padding:24px"><p><strong>Conexión Gmail correcta.</strong></p><p>IDEALO SV pudo autenticarse con Gmail y enviar este mensaje de prueba a <strong>${recipient}</strong>.</p><p>Esta prueba es independiente de Hacienda: no genera, firma ni transmite ningún DTE.</p><p style="font-size:13px;color:#666">Remitente configurado: ${fromName}</p></div></div></body></html>`,
  }
}

export async function sendGmailSelfTest({ request, supabase, env = process.env, transporterFactory }) {
  const token = bearerToken(request)
  if (!token) {
    const error = new Error('Debes iniciar sesión para probar Gmail.')
    error.statusCode = 401
    throw error
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    const error = new Error('La sesión no es válida o ya venció.')
    error.statusCode = 401
    throw error
  }

  const companyId = request.body?.companyId
  if (!companyId) {
    const error = new Error('Debes indicar la empresa para probar Gmail.')
    error.statusCode = 400
    throw error
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    const error = new Error('No tienes permiso para probar el correo de esta empresa.')
    error.statusCode = 403
    throw error
  }

  const config = gmailConfig(env)
  if (!config.user || !config.appPassword) {
    const error = new Error('Gmail no está configurado en el backend.')
    error.statusCode = 503
    throw error
  }

  const cooldownKey = `${companyId}:${userData.user.id}`
  const lastSentAt = testCooldowns.get(cooldownKey) || 0
  if (Date.now() - lastSentAt < 60_000) {
    const error = new Error('Esperá un minuto antes de repetir la prueba de Gmail.')
    error.statusCode = 429
    throw error
  }

  const transporter = transporterFactory
    ? transporterFactory(config)
    : nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.user, pass: config.appPassword },
        connectionTimeout: GMAIL_TIMEOUT_MS,
        greetingTimeout: GMAIL_TIMEOUT_MS,
        socketTimeout: GMAIL_TIMEOUT_MS,
      })

  try {
    await withTimeout(transporter.verify(), 'La verificación SMTP de Gmail')
    const message = buildGmailTestMessage({ fromName: config.fromName, recipient: config.user })
    const sent = await withTimeout(transporter.sendMail({
      from: { name: config.fromName, address: config.user },
      to: config.user,
      replyTo: config.user,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }), 'El envío del correo de prueba')

    testCooldowns.set(cooldownKey, Date.now())
    return {
      ok: true,
      verified: true,
      sent: true,
      recipient: config.user,
      messageId: text(sent?.messageId) || null,
      fiscalDocumentTouched: false,
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    throw normalizeGmailError(error)
  } finally {
    if (!transporterFactory && typeof transporter.close === 'function') transporter.close()
  }
}
