import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGmailTestMessage, sendGmailSelfTest } from '../src/dte/gmail-test-service.js'

test('construye un correo de prueba separado de Hacienda', () => {
  const message = buildGmailTestMessage({ fromName: 'IDEALO SV - Facturación', recipient: 'empresa@gmail.com' })
  assert.match(message.subject, /Prueba de correo IDEALO SV/)
  assert.match(message.html, /Conexión Gmail correcta/)
  assert.match(message.html, /no genera, firma ni transmite ningún DTE/i)
})

test('verifica Gmail y envía únicamente al correo configurado', async () => {
  let verified = false
  let sentMail = null
  const transporter = {
    async verify() { verified = true },
    async sendMail(message) { sentMail = message; return { messageId: '<gmail-test@example>' } },
  }
  const membershipChain = {
    select() { return this },
    eq() { return this },
    async maybeSingle() { return { data: { role: 'owner' }, error: null } },
  }
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: 'user-1' } }, error: null } } },
    from(table) { assert.equal(table, 'company_members'); return membershipChain },
  }
  const result = await sendGmailSelfTest({
    request: { headers: { authorization: 'Bearer session-token' }, body: { companyId: 'company-1' } },
    supabase,
    env: { GMAIL_SMTP_USER: 'Empresa@Gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', GMAIL_FROM_NAME: 'IDEALO SV - Facturación' },
    transporterFactory: () => transporter,
  })

  assert.equal(verified, true)
  assert.equal(sentMail.to, 'empresa@gmail.com')
  assert.equal(sentMail.from.address, 'empresa@gmail.com')
  assert.equal(result.ok, true)
  assert.equal(result.sent, true)
  assert.equal(result.fiscalDocumentTouched, false)
})
