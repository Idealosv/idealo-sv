import nodemailer from 'nodemailer'
import { dtePdfFilename, generateDtePdf } from './dte-pdf-service.js'

const text = (value) => String(value ?? '').trim()
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function htmlEscape(value) {
  return text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
function responseBody(value) { return value?.body || value || {} }
function receiptSeal(response) { const body = responseBody(response); return text(body.selloRecibido || body.selloRecepcion || body.sello || '') }
function gmailConfig(env) { return { user: text(env.GMAIL_SMTP_USER), appPassword: text(env.GMAIL_APP_PASSWORD).replace(/\s+/g, ''), fromName: text(env.GMAIL_FROM_NAME || 'IDEALO SV - Facturación') } }
function queryUrl(document) { const ambiente=document?.environment==='production'?'01':'00'; return `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(text(document?.generation_code))}` }

export function invoiceRecipient(document) { return text(document?.dte_payload?.receptor?.correo).toLowerCase() }

export function buildInvoiceEmail(document, mhResponse = document?.mh_response) {
  const dte = document?.dte_payload || {}, receptor = dte.receptor || {}, resumen = dte.resumen || {}, emisor = dte.emisor || {}, identificacion=dte.identificacion||{}
  const seal = receiptSeal(mhResponse)
  const typeLabel = document?.dte_type === '03' ? 'Comprobante de Crédito Fiscal' : 'Factura de Consumidor Final'
  const recipientName = text(receptor.nombre) || 'cliente'
  const businessName = text(emisor.nombreComercial || emisor.nombre || 'IDEALO SV')
  const legalName = text(emisor.nombre || businessName)
  const total = resumen.totalPagar ?? resumen.montoTotalOperacion ?? resumen.totalGravada ?? 0
  const consultationUrl=queryUrl(document)
  const issueDate=[text(identificacion.fecEmi),text(identificacion.horEmi)].filter(Boolean).join(' ')

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="padding:28px 12px"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.06)">
    <div style="background:#17191d;padding:26px 30px;border-left:6px solid #f97316">
      <table role="presentation" style="width:100%;border-collapse:collapse"><tr><td>
        <div style="font-size:24px;font-weight:800;color:#f97316;letter-spacing:.4px">${htmlEscape(businessName)}</div>
        <div style="font-size:12px;font-weight:700;color:#fff;margin-top:4px">${htmlEscape(legalName)}</div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:5px">Facturación electrónica · El Salvador</div>
      </td><td style="text-align:right;vertical-align:top"><span style="display:inline-block;background:#fff;color:#17191d;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:800">DTE ACEPTADO MH</span></td></tr></table>
    </div>
    <div style="padding:30px">
      <div style="font-size:20px;font-weight:800;color:#111827">Su ${htmlEscape(typeLabel)}</div>
      <p style="margin:8px 0 20px;color:#6b7280;font-size:13px">Documento tributario electrónico procesado y aceptado por el Ministerio de Hacienda.</p>
      <p style="font-size:14px">Estimado/a <strong>${htmlEscape(recipientName)}</strong>:</p>
      <p style="font-size:14px">Adjuntamos la representación gráfica en <strong>PDF</strong> y los archivos electrónicos correspondientes a su DTE. Puede guardar, imprimir o archivar el PDF para su control.</p>

      <div style="margin:22px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#f9fafb;padding:11px 15px;font-weight:800;font-size:12px;color:#374151">RESUMEN DEL DOCUMENTO</div>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:10px 15px;color:#6b7280;border-top:1px solid #eee;width:38%">Tipo</td><td style="padding:10px 15px;border-top:1px solid #eee;font-weight:700">${htmlEscape(typeLabel)}</td></tr>
          <tr><td style="padding:10px 15px;color:#6b7280;border-top:1px solid #eee">Número de control</td><td style="padding:10px 15px;border-top:1px solid #eee;font-weight:700;word-break:break-word">${htmlEscape(document?.control_number)}</td></tr>
          <tr><td style="padding:10px 15px;color:#6b7280;border-top:1px solid #eee">Código de generación</td><td style="padding:10px 15px;border-top:1px solid #eee;font-weight:700;word-break:break-word">${htmlEscape(document?.generation_code)}</td></tr>
          <tr><td style="padding:10px 15px;color:#6b7280;border-top:1px solid #eee">Fecha y hora</td><td style="padding:10px 15px;border-top:1px solid #eee;font-weight:700">${htmlEscape(issueDate || '—')}</td></tr>
          <tr><td style="padding:12px 15px;color:#111827;border-top:1px solid #e5e7eb;font-weight:800">TOTAL</td><td style="padding:12px 15px;border-top:1px solid #e5e7eb;font-size:18px;font-weight:800;color:#f97316">${htmlEscape(money(total))}</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin:24px 0"><a href="${htmlEscape(consultationUrl)}" style="display:inline-block;background:#17191d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-size:13px;font-weight:800;border-bottom:3px solid #f97316">Consultar DTE en Hacienda</a></div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:13px 15px;font-size:12px;color:#7c2d12"><strong>Sello de recepción MH</strong><div style="margin-top:5px;word-break:break-all;font-family:monospace;color:#9a3412">${htmlEscape(seal || 'RECIBIDO')}</div></div>

      <div style="margin-top:24px;font-size:12px;color:#6b7280;line-height:1.6"><strong>Archivos adjuntos:</strong> representación gráfica PDF, JSON del DTE, documento firmado JWS y respuesta del Ministerio de Hacienda cuando estén disponibles.</div>
      <p style="margin-top:25px;font-size:13px">Gracias por confiar en <strong>${htmlEscape(businessName)}</strong>.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 30px;font-size:10.5px;color:#6b7280;line-height:1.5">Este correo fue generado automáticamente por IDEALO SV después de la aceptación del DTE por Hacienda. Un reenvío del correo no genera, firma ni transmite un nuevo documento fiscal.</div>
  </div></div></body></html>`

  return {
    subject: `${businessName} · ${typeLabel} · ${text(document?.control_number) || 'DTE'}`,
    html,
    attachments: [
      { filename: `${text(document?.control_number) || 'DTE'}.json`, content: JSON.stringify(dte, null, 2), contentType: 'application/json' },
      ...(document?.signed_document ? [{ filename: `${text(document?.control_number) || 'DTE'}.jws.txt`, content: document.signed_document, contentType: 'text/plain' }] : []),
      ...(mhResponse ? [{ filename: `${text(document?.control_number) || 'DTE'}-respuesta-MH.json`, content: JSON.stringify(responseBody(mhResponse), null, 2), contentType: 'application/json' }] : []),
    ],
  }
}

export async function buildInvoiceEmailWithPdf(document, mhResponse = document?.mh_response) {
  const message = buildInvoiceEmail(document, mhResponse)
  const pdf = await generateDtePdf(document, mhResponse)
  return { ...message, attachments: [{ filename: dtePdfFilename(document), content: pdf, contentType: 'application/pdf' }, ...message.attachments] }
}

export async function sendProcessedInvoiceEmail({ supabase, document, env = process.env, transporterFactory }) {
  if (document?.environment !== 'production' || document?.status !== 'PROCESSED') return { attempted: false, status: 'skipped', reason: 'ONLY_PROCESSED_PRODUCTION' }
  const recipient = invoiceRecipient(document)
  if (!recipient) return { attempted: false, status: 'skipped', reason: 'NO_RECIPIENT_EMAIL' }

  const { data: existing, error: existingError } = await supabase.from('invoice_email_deliveries').select('id, status, provider_message_id, error_message, sent_at').eq('dte_document_id', document.id).eq('delivery_kind', 'automatic').maybeSingle()
  if (existingError) throw existingError
  if (existing?.status === 'sent') return { attempted: false, status: 'sent', alreadySent: true, ...existing }

  let deliveryId = existing?.id
  if (!deliveryId) {
    const { data: created, error: createError } = await supabase.from('invoice_email_deliveries').insert({ dte_document_id: document.id, company_id: document.company_id, recipient_email: recipient, delivery_kind: 'automatic', status: 'pending' }).select('id').single()
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

  const transporter = transporterFactory ? transporterFactory(config) : nodemailer.createTransport({ service: 'gmail', auth: { user: config.user, pass: config.appPassword } })
  try {
    const message = await buildInvoiceEmailWithPdf(document)
    const sent = await transporter.sendMail({ from: { name: config.fromName, address: config.user }, to: recipient, replyTo: config.user, subject: message.subject, html: message.html, attachments: message.attachments })
    const now = new Date().toISOString()
    await supabase.from('invoice_email_deliveries').update({ status: 'sent', provider_message_id: text(sent.messageId) || null, sent_at: now, error_message: null, updated_at: now }).eq('id', deliveryId)
    return { attempted: true, status: 'sent', recipient, messageId: text(sent.messageId) || null, sentAt: now, pdfAttached: true }
  } catch (error) {
    const messageText = text(error?.message).slice(0, 1000) || 'No se pudo enviar el correo por Gmail.'
    await supabase.from('invoice_email_deliveries').update({ status: 'failed', error_message: messageText, updated_at: new Date().toISOString() }).eq('id', deliveryId)
    return { attempted: true, status: 'failed', recipient, error: messageText }
  } finally { if (!transporterFactory && typeof transporter.close === 'function') transporter.close() }
}
