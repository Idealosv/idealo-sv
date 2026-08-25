import nodemailer from 'nodemailer'

const text = (value) => String(value ?? '').trim()
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function htmlEscape(value) {
  return text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function responseBody(value) {
  return value?.body || value || {}
}

function receiptSeal(response) {
  const body = responseBody(response)
  return text(body.selloRecibido || body.selloRecepcion || body.sello || '')
}

function gmailConfig(env) {
  return {
    user: text(env.GMAIL_SMTP_USER),
    appPassword: text(env.GMAIL_APP_PASSWORD),
    fromName: text(env.GMAIL_FROM_NAME || 'IDEALO SV - Facturación'),
  }
}

export function invoiceRecipient(document) {
  return text(document?.dte_payload?.receptor?.correo).toLowerCase()
}

export function buildInvoiceEmail(document, mhResponse = document?.mh_response) {
  const dte = document?.dte_payload || {}
  const receptor = dte.receptor || {}
  const resumen = dte.resumen || {}
  const emisor = dte.emisor || {}
  const seal = receiptSeal(mhResponse)
  const typeLabel = document?.dte_type === '03' ? 'Comprobante de Crédito Fiscal' : 'Factura de Consumidor Final'
  const recipientName = text(receptor.nombre) || 'cliente'
  const total = resumen.totalPagar ?? resumen.montoTotalOperacion ?? resumen.totalGravada ?? 0

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
    <div style="max-width:680px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">
      <div style="background:#15181c;color:white;padding:20px 24px"><strong style="color:#ff6a00">IDEALO SV</strong><br><span>Facturación electrónica</span></div>
      <div style="padding:24px">
        <p>Estimado/a ${htmlEscape(recipientName)},</p>
        <p>Adjuntamos la evidencia electrónica de su ${htmlEscape(typeLabel)}, aceptada por el Ministerio de Hacienda.</p>
        <table style="width:100%;border-collapse:collapse;margin:18px 0">
          <tr><td style="padding:7px;border-bottom:1px solid #eee">Emisor</td><td style="padding:7px;border-bottom:1px solid #eee"><strong>${htmlEscape(emisor.nombre || emisor.nombreComercial || 'IDEALO SV')}</strong></td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #eee">Número de control</td><td style="padding:7px;border-bottom:1px solid #eee">${htmlEscape(document?.control_number)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #eee">Código de generación</td><td style="padding:7px;border-bottom:1px solid #eee">${htmlEscape(document?.generation_code)}</td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #eee">Total</td><td style="padding:7px;border-bottom:1px solid #eee"><strong>${htmlEscape(money(total))}</strong></td></tr>
          <tr><td style="padding:7px;border-bottom:1px solid #eee">Sello de recepción MH</td><td style="padding:7px;border-bottom:1px solid #eee;word-break:break-all">${htmlEscape(seal || 'RECIBIDO')}</td></tr>
        </table>
        <p style="font-size:13px;color:#666">Este correo fue generado automáticamente por IDEALO SV después de la aceptación del DTE por Hacienda. No se envían documentos rechazados, en borrador ni de ambiente TEST.</p>
      </div>
    </div>
  </body></html>`

  return {
    subject: `${typeLabel} - ${text(document?.control_number) || 'IDEALO SV'}`,
    html,
    attachments: [
      { filename: `${text(document?.control_number) || 'DTE'}.json`, content: JSON.stringify(dte, null, 2), contentType: 'application/json' },
      ...(document?.signed_document ? [{ filename: `${text(document?.control_number) || 'DTE'}.jws.txt`, content: document.signed_document, contentType: 'text/plain' }] : []),
      ...(mhResponse ? [{ filename: `${text(document?.control_number) || 'DTE'}-respuesta-MH.json`, content: JSON.stringify(responseBody(mhResponse), null, 2), contentType: 'application/json' }] : []),
    ],
  }
}

export async function sendProcessedInvoiceEmail({ supabase, document, env = process.env }) {
  if (document?.environment !== 'production' || document?.status !== 'PROCESSED') {
    return { attempted: false, status: 'skipped', reason: 'ONLY_PROCESSED_PRODUCTION' }
  }

  const recipient = invoiceRecipient(document)
  if (!recipient) return { attempted: false, status: 'skipped', reason: 'NO_RECIPIENT_EMAIL' }

  const { data: existing, error: existingError } = await supabase
    .from('invoice_email_deliveries')
    .select('id, status, provider_message_id, error_message, sent_at')
    .eq('dte_document_id', document.id)
    .eq('delivery_kind', 'automatic')
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.status === 'sent') return { attempted: false, status: 'sent', alreadySent: true, ...existing }

  let deliveryId = existing?.id
  if (!deliveryId) {
    const { data: created, error: createError } = await supabase
      .from('invoice_email_deliveries')
      .insert({ dte_document_id: document.id, company_id: document.company_id, recipient_email: recipient, delivery_kind: 'automatic', status: 'pending' })
      .select('id')
      .single()
    if (createError) throw createError
    deliveryId = created.id
  } else {
    await supabase.from('invoice_email_deliveries').update({ recipient_email: recipient, status: 'pending', error_message: null, updated_at: new Date().toISOString() }).eq('id', deliveryId)
  }

  const config = gmailConfig(env)
  if (!config.user || !config.appPassword) {
    const message = 'Gmail automático pendiente de configurar: faltan GMAIL_SMTP_USER o GMAIL_APP_PASSWORD en el backend.'
    await supabase.from('invoice_email_deliveries').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', deliveryId)
    return { attempted: false, status: 'failed', reason: 'GMAIL_NOT_CONFIGURED' }
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: config.user, pass: config.appPassword } })
  const message = buildInvoiceEmail(document)
  try {
    const sent = await transporter.sendMail({
      from: { name: config.fromName, address: config.user },
      to: recipient,
      replyTo: config.user,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments,
    })
    const now = new Date().toISOString()
    await supabase.from('invoice_email_deliveries').update({ status: 'sent', provider_message_id: text(sent.messageId) || null, sent_at: now, error_message: null, updated_at: now }).eq('id', deliveryId)
    return { attempted: true, status: 'sent', recipient, messageId: text(sent.messageId) || null, sentAt: now }
  } catch (error) {
    const messageText = text(error?.message).slice(0, 1000) || 'No se pudo enviar el correo por Gmail.'
    await supabase.from('invoice_email_deliveries').update({ status: 'failed', error_message: messageText, updated_at: new Date().toISOString() }).eq('id', deliveryId)
    return { attempted: true, status: 'failed', recipient, error: messageText }
  }
}
