import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../../web/src/FacturacionLauncher.jsx',import.meta.url),'utf8')
const patch=fs.readFileSync(new URL('../../web/scripts/patch-billing-manual-project-separation.mjs',import.meta.url),'utf8')
const pkg=JSON.parse(fs.readFileSync(new URL('../../web/package.json',import.meta.url),'utf8'))

test('modo proyecto y venta manual quedan separados',()=>{
  assert.match(launcher,/issueMode==='project'[\s\S]*PartialInvoiceFromQuote/)
  assert.match(launcher,/issueMode==='manual'[\s\S]*FacturacionDte/)
  assert.match(patch,/allowProjectSource=false/)
  assert.match(patch,/allowProjectSource&&/)
  assert.match(pkg.scripts.prebuild,/patch-billing-manual-project-separation\.mjs/)
})
