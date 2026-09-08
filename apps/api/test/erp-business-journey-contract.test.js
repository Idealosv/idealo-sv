import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../../web/package.json', import.meta.url), 'utf8'))
const audit = String(pkg.scripts?.audit || '')

const requiredFlows = [
  'audit-commercial-flow.mjs',
  'audit-quote-production-flow.mjs',
  'audit-production-inventory-flow.mjs',
  'audit-procurement-receiving-flow.mjs',
  'audit-payables-cash-flow.mjs',
  'audit-receivables-cash-flow.mjs',
  'audit-cash-reconciliation-flow.mjs',
  'audit-end-to-end-business-flow.mjs',
  'audit-client-integrity.mjs',
  'audit-product-integrity.mjs',
  'audit-mobile-regression.mjs',
]

test('la auditoría principal conserva el recorrido empresarial completo', () => {
  for (const flow of requiredFlows) {
    assert.match(audit, new RegExp(flow.replaceAll('.', '\\.')), `Falta ${flow} en npm run audit`)
  }
})
