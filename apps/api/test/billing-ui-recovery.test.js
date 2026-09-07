import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const web=path.resolve(here,'../../web/src')
const main=fs.readFileSync(path.join(web,'main.jsx'),'utf8')
const deferred=fs.readFileSync(path.join(web,'DeferredRuntimeHosts.jsx'),'utf8')
const recovery=fs.readFileSync(path.join(web,'BillingUiRecovery.jsx'),'utf8')
const css=fs.readFileSync(path.join(web,'billing-ui-recovery.css'),'utf8')

test('facturacion: recuperación UI queda montada en runtime diferido',()=>{
  assert.match(main,/DeferredRuntimeHosts/)
  assert.match(deferred,/BillingUiRecovery/)
  assert.match(main,/billing-ui-recovery\.css/)
})

test('facturacion: solo oculta error genérico cuando el documento está listo',()=>{
  assert.match(recovery,/Ocurrió un error inesperado\./)
  assert.match(recovery,/Origen cargado:/)
  assert.match(recovery,/Documento listo para guardar/)
  assert.match(recovery,/banner\.hidden=true/)
})

test('facturacion: botón de Crédito Fiscal usa anaranjado institucional',()=>{
  assert.match(recovery,/Crédito Fiscal/)
  assert.match(css,/\.billing-orange-submit/)
  assert.match(css,/#f97316/i)
})
