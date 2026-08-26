import test from 'node:test'
import assert from 'node:assert/strict'
import { sendInvoicePdfSelfTest } from '../src/dte/invoice-email-preview-service.js'

const document = {
  id: '11111111-1111-1111-1111-111111111111',
  company_id: '22222222-2222-2222-2222-222222222222',
  dte_type: '01',
  control_number: 'DTE-01-M001P001-000000000000001',
  generation_code: '33333333-3333-4333-8333-333333333333',
  environment: 'test',
  status: 'PROCESSED',
  signed_document: 'header.payload.signature',
  dte_payload: {
    identificacion: { fecEmi: '2026-08-25', horEmi: '22:00:00' },
    emisor: { nombre: 'IDEALO SV', nit: '00000000000000' },
    receptor: { nombre: 'Cliente de prueba', correo: 'cliente@example.com' },
    cuerpoDocumento: [{ numItem: 1, descripcion: 'Servicio de prueba', cantidad: 1, precioUni: 10, ventaGravada: 10, ventaExenta: 0, ventaNoSuj: 0 }],
    resumen: { totalGravada: 10, totalExenta: 0, totalNoSuj: 0, totalIva: 1.15, totalPagar: 10 },
  },
  mh_response: { body: { estado: 'PROCESADO', selloRecibido: 'SELLO-MH-PRUEBA', descripcionMsg: 'Procesado' } },
}

function queryResult(data) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error: null }),
  }
  return chain
}

test('envía solamente el PDF del DTE aceptado con una sola conexión SMTP y sin transmitir a MH', async () => {
  let sentMail
  let verifyCalled = false
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table) => table === 'dte_documents' ? queryResult(document) : queryResult({ role: 'owner' }),
  }
  const request = { headers: { authorization: 'Bearer test-token' }, body: { documentId: document.id } }
  const result = await sendInvoicePdfSelfTest({
    request,
    supabase,
    env: { GMAIL_SMTP_USER: 'idealo@example.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop', GMAIL_FROM_NAME: 'IDEALO SV - Facturación' },
    transporterFactory: () => ({
      verify: async () => { verifyCalled = true },
      sendMail: async (mail) => { sentMail = mail; return { messageId: 'preview-123' } },
    }),
  })

  assert.equal(verifyCalled, false)
  assert.equal(result.ok, true)
  assert.equal(result.recipient, 'idealo@example.com')
  assert.equal(result.pdfAttached, true)
  assert.equal(result.attachmentCount, 1)
  assert.equal(result.transmittedToMh, false)
  assert.equal(result.fiscalDocumentTouched, false)
  assert.equal(sentMail.to, 'idealo@example.com')
  assert.match(sentMail.subject, /^\[PRUEBA PDF\]/)
  assert.equal(sentMail.attachments.length, 1)
  assert.equal(sentMail.attachments[0].contentType, 'application/pdf')
  assert.ok(sentMail.attachments[0].content.subarray(0, 5).toString().startsWith('%PDF-'))
})

test('convierte un rechazo SMTP en un error útil para la interfaz', async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table) => table === 'dte_documents' ? queryResult(document) : queryResult({ role: 'owner' }),
  }
  const request = { headers: { authorization: 'Bearer test-token' }, body: { documentId: document.id } }

  await assert.rejects(
    sendInvoicePdfSelfTest({
      request,
      supabase,
      env: { GMAIL_SMTP_USER: 'idealo@example.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop' },
      transporterFactory: () => ({ sendMail: async () => { const error = new Error('Authentication failed'); error.code = 'EAUTH'; throw error } }),
    }),
    (error) => error.statusCode === 502 && /Gmail rechazó la autenticación/.test(error.message),
  )
})
