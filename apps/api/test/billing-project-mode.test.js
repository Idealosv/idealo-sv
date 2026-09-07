import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const launcher=fs.readFileSync(new URL('../../web/src/FacturacionLauncher.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../../web/src/billing-ui-recovery.css',import.meta.url),'utf8')
const sw=fs.readFileSync(new URL('../../web/public/sw.js',import.meta.url),'utf8')

test('Nueva factura abre en modo proyecto',()=>{
  assert.match(launcher,/if \(id === 'emitir'\) setIssueMode\('project'\)/)
  assert.match(launcher,/data-issue-mode=\{issueMode\}/)
  assert.match(launcher,/PartialInvoiceFromQuote/)
})

test('Crédito Fiscal queda resaltado en anaranjado',()=>{
  assert.match(css,/background:#f97316 !important/)
  assert.match(css,/billing-classic-summary button\[type="submit"\]/)
})

test('service worker cambia versión de caché',()=>{
  assert.match(sw,/idealo-mobile-v6/)
})
