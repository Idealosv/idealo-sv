import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const panel=fs.readFileSync(new URL('../../web/src/BillingReceivablesPanel.jsx',import.meta.url),'utf8')
const helper=fs.readFileSync(new URL('../../web/src/paymentReversal.js',import.meta.url),'utf8')

test('CxC consulta reversos y no ofrece reversar dos veces',()=>{
  assert.match(panel,/customer_payment_reversals/)
  assert.match(panel,/REVERSADO/)
  assert.match(panel,/!reversal&&<button/)
})

test('helper usa RPC controlado y motivo obligatorio',()=>{
  assert.match(helper,/reverse_customer_payment/)
  assert.match(helper,/cleanReason\.length<4/)
  assert.match(helper,/p_reversal_key/)
})
