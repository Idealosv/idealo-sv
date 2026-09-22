import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const investors=read('apps/web/src/PrestaditosInvestorsPanel.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('menu lateral deja visibles solo modulos principales y agrupa secundarios',()=>{
 for(const source of [preview,host]){
  assert.match(source,/PRIMARY_TABS/)
  assert.match(source,/OPERATION_TABS/)
  assert.match(source,/ADMIN_TABS/)
  assert.match(source,/Más operación/)
  assert.match(source,/Administración/)
  assert.match(source,/prst-nav-group/)
 }
})

test('acciones secundarias de inversionistas se agrupan bajo Mas',()=>{
 assert.match(investors,/prst-action-menu top/)
 assert.match(investors,/prst-investor-actions compact/)
 assert.match(investors,/<summary>Más<\/summary>/)
 assert.match(preview,/prst-investor-actions compact/)
})

test('navegacion relacionada de inversionistas sigue conectada',()=>{
 assert.match(host,/onNavigate=\{goFromAlert\}/)
 assert.match(investors,/goProfile/)
 assert.match(investors,/goDocuments/)
 assert.match(investors,/goContracts/)
})

test('estilos reducen ruido de botones sin eliminar acciones',()=>{
 assert.match(css,/GLOBAL SIMPLIFICATION · LESS BUTTON NOISE/)
 assert.match(css,/prst-nav-group/)
 assert.match(css,/prst-action-menu/)
 assert.match(css,/prst-investor-actions\.compact/)
})
