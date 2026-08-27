import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const shell=fs.readFileSync(new URL('../../web/src/mobile-native-shell.css',import.meta.url),'utf8')
const base=fs.readFileSync(new URL('../../web/src/mobile-app.css',import.meta.url),'utf8')

test('App móvil carga una capa visual exclusiva tipo app',()=>{
  assert.match(base,/@import '\.\/mobile-native-shell\.css'/)
  assert.match(shell,/\.mobile-app-shell/)
  assert.match(shell,/\.mobile-bottom-nav/)
})

test('App móvil respeta safe areas de Android y modo standalone',()=>{
  assert.match(shell,/env\(safe-area-inset-top\)/)
  assert.match(shell,/env\(safe-area-inset-bottom\)/)
  assert.match(shell,/@media\(display-mode:standalone\)/)
})

test('formularios móviles evitan zoom y usan objetivos táctiles grandes',()=>{
  assert.match(shell,/font-size:16px!important/)
  assert.match(shell,/min-height:50px!important/)
  assert.match(shell,/min-height:52px!important/)
})
