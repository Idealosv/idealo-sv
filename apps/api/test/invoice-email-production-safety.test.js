import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceEmail, invoiceRecipient, sendProcessedInvoiceEmail } from '../src/dte/invoice-email-service.js'

function document(overrides = {}) {
  return {
    id: 'dte-1', company_id: 'company-1', dte_type: '01', environment: 'production', status: 'PROCESSED',
    control_number: 'DTE-01-M001P001-000000000000001', generation_code: '11111111-2222-4333-8444-555555555555',
    signed_document: 'signed-jws', mh_response: { body: { estado: 'PROCESADO', selloRecibido: 'SELLO-MH' } },
    dte_payload: { identificacion: { ambiente: '01', tipoDte: '01', fecEmi: '2026-08-26', horEmi: '10:00:00' }, emisor: { nombre: 'Empresa Demo', nombreComercial: 'IDEALO SV' }, receptor: { nombre: 'Cliente Demo', correo: ' Cliente@Example.com ' }, resumen: { totalPagar: 25 } },
    ...overrides,
  }
}

function supabaseWithExisting(existing) {
  return { from(table) { assert.equal(table, 'invoice_email_deliveries'); return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: existing, error: null }) } } }
}

test('normaliza el correo del receptor', () => { assert.equal(invoiceRecipient(document()), 'cliente@example.com') })

test('correo empresarial incluye control, total, consulta MH y adjuntos fiscales', () => {
  const message = buildInvoiceEmail(document())
  assert.match(message.subject, /IDEALO SV/)
  assert.match(message.html, /DTE ACEPTADO MH/)
  assert.match(message.html, /DTE-01-M001P001-000000000000001/)
  assert.match(message.html, /\$25\.00/)
  assert.match(message.html, /admin\.factura\.gob\.sv\/consultaPublica/)
  assert.deepEqual(message.attachments.map(a => a.contentType), ['application/json', 'text/plain', 'application/json'])
})

test('jamás envía correo automático para DTE TEST', async () => {
  const result = await sendProcessedInvoiceEmail({ supabase: {}, document: document({ environment: 'test' }) })
  assert.deepEqual(result, { attempted: false, status: 'skipped', reason: 'ONLY_PROCESSED_PRODUCTION' })
})

test('jamás envía correo antes de aceptación MH', async () => {
  const result = await sendProcessedInvoiceEmail({ supabase: {}, document: document({ status: 'SIGNED' }) })
  assert.deepEqual(result, { attempted: false, status: 'skipped', reason: 'ONLY_PROCESSED_PRODUCTION' })
})

test('no duplica un correo automático ya enviado', async () => {
  const result = await sendProcessedInvoiceEmail({ supabase: supabaseWithExisting({ id: 'delivery-1', status: 'sent', provider_message_id: 'msg-1', error_message: null, sent_at: '2026-08-26T10:01:00Z' }), document: document() })
  assert.equal(result.attempted, false)
  assert.equal(result.alreadySent, true)
  assert.equal(result.status, 'sent')
})
