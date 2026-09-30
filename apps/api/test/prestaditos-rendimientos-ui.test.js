import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('rendimientos permite registrar, filtrar, consultar y revertir pagos',()=>{
 assert.match(preview,/function Payments\(\)/)
 assert.match(preview,/\+ Registrar pago/)
 assert.match(preview,/Todos los tipos/)
 assert.match(preview,/Todos los estados/)
 assert.match(preview,/Ver detalle/)
 assert.match(preview,/Revertir movimiento/)
 assert.match(preview,/Motivo obligatorio/)
 assert.match(preview,/capitalPendingFor/)
})

test('rendimientos conserva una presentación compacta y adaptable',()=>{
 assert.match(css,/\.prst-payments-module/)
 assert.match(css,/\.prst-payment-tools/)
 assert.match(css,/\.prst-payment-detail/)
 assert.match(css,/@media\(max-width:900px\)/)
})
