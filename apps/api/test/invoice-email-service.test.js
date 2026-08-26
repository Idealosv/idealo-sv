import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceEmail, buildInvoiceEmailWithPdf, invoiceRecipient, sendProcessedInvoiceEmail } from '../src/dte/invoice-email-service.js'
import { generateDtePdf } from '../src/dte/dte-pdf-service.js'

const document = {
  id: '11111111-1111-1111-1111-111111111111',
  company_id: '22222222-2222-2222-2222-222222222222',
  dte_type: '01',
  environment: 'production',
  status: 'PROCESSED',
  control_number: 'DTE-01-M001P001-000000000000001',
  generation_code: '33333333-3333-4333-8333-333333333333',
  signed_document: 'header.payload.signature',
  dte_payload: {
    identificacion: { fecEmi: '2026-08-25', horEmi: '22:30:00' },
    emisor: { nombre: 'IDEALO SV', nit: '06140000000000', nrc: '123456', descActividad: 'Publicidad', direccion: { complemento: 'El Salvador' } },
    receptor: { nombre: 'Cliente Ejemplo', correo: 'CLIENTE@EXAMPLE.COM', numDocumento: '00000000-0' },
    cuerpoDocumento: [{ numItem: 1, descripcion: 'Producto personalizado', cantidad: 2, precioUni: 12.75, ventaGravada: 25.5, ventaExenta: 0, ventaNoSuj: 0 }],
    resumen: { totalGravada: 25.5, totalExenta: 0, totalNoSuj: 0, totalIva: 2.93, totalPagar: 25.5, totalLetras: 'VEINTICINCO 50/100 DÓLARES' },
  },
  mh_response: { estado: 'PROCESADO', selloRecibido: 'SELLO-MH-123', codigoMsg: '001', descripcionMsg: 'RECIBIDO' },
}

test('normaliza el correo del receptor', () => {
  assert.equal(invoiceRecipient(document), 'cliente@example.com')
})

test('construye correo con identificación fiscal y evidencia electrónica', () => {
  const message = buildInvoiceEmail(document)
  assert.match(message.subject, /Factura de Consumidor Final/)
  assert.match(message.html, /DTE-01-M001P001-000000000000001/)
  assert.match(message.html, /SELLO-MH-123/)
  assert.equal(message.attachments.length, 3)
  assert.ok(message.attachments.some((item) => item.filename.endsWith('.json')))
})

test('genera una representación gráfica PDF válida', async () => {
  const pdf = await generateDtePdf(document)
  assert.ok(Buffer.isBuffer(pdf))
  assert.ok(pdf.length > 1000)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
})

test('coloca el PDF como primer adjunto del correo automático', async () => {
  const message = await buildInvoiceEmailWithPdf(document)
  assert.equal(message.attachments.length, 4)
  assert.match(message.attachments[0].filename, /representacion-grafica\.pdf$/)
  assert.equal(message.attachments[0].contentType, 'application/pdf')
  assert.equal(message.attachments[0].content.subarray(0, 5).toString(), '%PDF-')
})

test('envío PROCESSED production entrega PDF y conserva idempotencia', async () => {
  const writes = []
  let sentMessage = null
  const query = {
    select() { return this }, eq() { return this },
    async maybeSingle() { return { data: null, error: null } },
    insert(value) { writes.push(['insert', value]); return this },
    update(value) { writes.push(['update', value]); return this },
    async single() { return { data: { id: 'delivery-1' }, error: null } },
    then(resolve) { resolve({ data: null, error: null }) },
  }
  const supabase = { from(table) { assert.equal(table, 'invoice_email_deliveries'); return Object.create(query) } }
  const transporter = { async sendMail(message) { sentMessage = message; return { messageId: '<invoice@example>' } } }

  const result = await sendProcessedInvoiceEmail({
    supabase,
    document,
    env: { GMAIL_SMTP_USER: 'empresa@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', GMAIL_FROM_NAME: 'IDEALO SV - Facturación' },
    transporterFactory: () => transporter,
  })

  assert.equal(result.status, 'sent')
  assert.equal(result.pdfAttached, true)
  assert.equal(sentMessage.to, 'cliente@example.com')
  assert.equal(sentMessage.attachments[0].contentType, 'application/pdf')
  assert.ok(writes.some(([kind, value]) => kind === 'update' && value.status === 'sent'))
})
