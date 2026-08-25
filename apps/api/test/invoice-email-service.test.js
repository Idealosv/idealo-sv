import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceEmail, invoiceRecipient } from '../src/dte/invoice-email-service.js'

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
    emisor: { nombre: 'IDEALO SV' },
    receptor: { nombre: 'Cliente Ejemplo', correo: 'CLIENTE@EXAMPLE.COM' },
    resumen: { totalPagar: 25.5 },
  },
  mh_response: { estado: 'PROCESADO', selloRecibido: 'SELLO-MH-123' },
}

test('normaliza el correo del receptor', () => {
  assert.equal(invoiceRecipient(document), 'cliente@example.com')
})

test('construye correo con identificación fiscal y evidencia adjunta', () => {
  const message = buildInvoiceEmail(document)
  assert.match(message.subject, /Factura de Consumidor Final/)
  assert.match(message.html, /DTE-01-M001P001-000000000000001/)
  assert.match(message.html, /SELLO-MH-123/)
  assert.equal(message.attachments.length, 3)
  assert.ok(message.attachments.some((item) => item.filename.endsWith('.json')))
})
