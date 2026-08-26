import test from 'node:test'
import assert from 'node:assert/strict'
import { getInvoiceEmailStatus, resendInvoiceEmail } from '../src/dte/invoice-email-management-service.js'

function request(documentId = 'dte-1') {
  return { headers: { authorization: 'Bearer valid-token' }, body: { documentId }, query: {} }
}

function document(overrides = {}) {
  return {
    id: 'dte-1', company_id: 'company-1', dte_type: '01', environment: 'production', status: 'PROCESSED',
    control_number: 'DTE-01-M001P001-000000000000001', generation_code: '11111111-2222-4333-8444-555555555555',
    signed_document: 'signed-jws', mh_response: { body: { estado: 'PROCESADO', selloRecibido: 'SELLO-MH' } },
    dte_payload: { identificacion: { ambiente: '01', tipoDte: '01', fecEmi: '2026-08-26', horEmi: '10:00:00' }, emisor: { nombre: 'Empresa Demo', nombreComercial: 'IDEALO SV' }, receptor: { nombre: 'Cliente Demo', correo: 'cliente@example.com' }, resumen: { totalPagar: 25 } },
    ...overrides,
  }
}

function supabaseFor({ doc = document(), deliveries = [] } = {}) {
  const inserted = []
  const updated = []
  return {
    inserted, updated,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table) {
      if (table === 'dte_documents') return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: doc, error: null }) }
      if (table === 'company_members') return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { role: 'admin' }, error: null }) }
      if (table === 'invoice_email_deliveries') return {
        select() { return this }, eq() { return this }, order() { return this }, limit: async () => ({ data: deliveries, error: null }),
        insert(payload) { inserted.push(payload); return { select() { return this }, single: async () => ({ data: { id: 'delivery-1' }, error: null }) } },
        update(payload) { updated.push(payload); return { eq: async () => ({ error: null }) } },
      }
      throw new Error(`Tabla inesperada: ${table}`)
    },
  }
}

for (const dteType of ['01', '03']) {
  test(`historial y elegibilidad funcionan para DTE-${dteType}`, async () => {
    const doc = document({ dte_type: dteType, control_number: `DTE-${dteType}-M001P001-000000000000001`, dte_payload: { ...document().dte_payload, identificacion: { ...document().dte_payload.identificacion, tipoDte: dteType } } })
    const deliveries = [{ id: 'delivery-old', recipient_email: 'cliente@example.com', delivery_kind: 'automatic', status: 'sent', sent_at: '2026-08-26T10:01:00Z' }]
    const result = await getInvoiceEmailStatus({ request: request(), supabase: supabaseFor({ doc, deliveries }) })
    assert.equal(result.eligible, true)
    assert.equal(result.trackingAvailable, true)
    assert.equal(result.latest.id, 'delivery-old')
  })
}

test('reenvío TEST queda bloqueado antes de crear entrega o usar SMTP', async () => {
  const supabase = supabaseFor({ doc: document({ environment: 'test' }) })
  let smtpUsed = false
  await assert.rejects(() => resendInvoiceEmail({ request: request(), supabase, env: { GMAIL_SMTP_USER: 'sender@example.com', GMAIL_APP_PASSWORD: 'app-password' }, transporterFactory: () => { smtpUsed = true; return {} } }), /Solo se puede reenviar un DTE de PRODUCCIÓN aceptado/)
  assert.equal(smtpUsed, false)
  assert.equal(supabase.inserted.length, 0)
})

test('reenvío sin sello MH queda bloqueado', async () => {
  const supabase = supabaseFor({ doc: document({ mh_response: { body: { estado: 'PROCESADO' } } }) })
  await assert.rejects(() => resendInvoiceEmail({ request: request(), supabase, env: { GMAIL_SMTP_USER: 'sender@example.com', GMAIL_APP_PASSWORD: 'app-password' } }), /sello de recepción/)
  assert.equal(supabase.inserted.length, 0)
})
