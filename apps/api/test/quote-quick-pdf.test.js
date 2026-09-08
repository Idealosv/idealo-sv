import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const moduleSource=fs.readFileSync(new URL('../../web/src/QuotesQuickModule.jsx',import.meta.url),'utf8')
const pdfSource=fs.readFileSync(new URL('../../web/src/quotePdf.js',import.meta.url),'utf8')
const launcher=fs.readFileSync(new URL('../../web/src/CommercialLauncher.jsx',import.meta.url),'utf8')

test('cotizaciones activa el flujo de tres pasos',()=>{
  assert.match(launcher,/QuotesQuickModule/)
  assert.match(moduleSource,/Solo tres pasos: cliente, productos y total/)
  assert.match(moduleSource,/qq-step-number">1/)
  assert.match(moduleSource,/qq-step-number">2/)
  assert.match(moduleSource,/qq-step-number">3/)
})

test('la vista previa genera un PDF real antes de guardar',()=>{
  assert.match(moduleSource,/Vista previa PDF/)
  assert.match(moduleSource,/createQuotePdfBlob/)
  assert.match(moduleSource,/URL\.createObjectURL/)
  assert.match(pdfSource,/application\/pdf/)
  assert.match(pdfSource,/%PDF-1\.4/)
})

test('el editor visible evita campos internos de rentabilidad',()=>{
  assert.doesNotMatch(moduleSource,/Costo base/)
  assert.doesNotMatch(moduleSource,/Margen objetivo/)
  assert.doesNotMatch(moduleSource,/Precio mínimo/)
  assert.doesNotMatch(moduleSource,/Recargo global/)
})
