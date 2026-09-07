import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../web/src')
const facturacion=fs.readFileSync(path.join(root,'FacturacionDte.jsx'),'utf8')
const normalizer=fs.readFileSync(path.join(root,'quoteInvoiceNormalizer.js'),'utf8')

test('cotización a DTE conserva el total fiscal del origen',()=>{
  assert.match(normalizer,/normalizeQuoteItemsToTotal/)
  assert.match(normalizer,/target\s*\/\s*current/)
  assert.match(facturacion,/normalizeQuoteItemsToTotal/)
  assert.match(facturacion,/total cotizado/i)
})

test('DTE bloquea guardado si el total del origen no coincide',()=>{
  assert.match(facturacion,/sourceTotalMismatch/)
  assert.match(facturacion,/no coincide con la cotización/i)
})
