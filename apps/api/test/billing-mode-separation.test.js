import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../../web/src/FacturacionLauncher.jsx',import.meta.url),'utf8')
const manual=fs.readFileSync(new URL('../../web/src/FacturacionDte.jsx',import.meta.url),'utf8')

test('modo proyecto y venta manual no mezclan cotizacion',()=>{
  assert.match(launcher,/issueMode==='project'[\s\S]*PartialInvoiceFromQuote/)
  assert.match(launcher,/issueMode==='manual'[\s\S]*FacturacionDte/)
  assert.match(manual,/allowProjectSource=false/)
  assert.match(manual,/allowProjectSource&&/)
})
