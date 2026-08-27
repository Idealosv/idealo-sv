import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow=fs.readFileSync(new URL('../../../.github/workflows/android-apk.yml',import.meta.url),'utf8')
const update=fs.readFileSync(new URL('../../web/src/MobileUpdateNotice.jsx',import.meta.url),'utf8')
const main=fs.readFileSync(new URL('../../web/src/main.jsx',import.meta.url),'utf8')

test('Android publica una actualización estable al cambiar main',()=>{
 assert.match(workflow,/push:\s*\n\s*branches:/)
 assert.match(workflow,/VITE_ANDROID_BUILD_SHA/)
 assert.match(workflow,/gh release create android-latest/)
 assert.match(workflow,/IDEALO-SV-Android\.apk/)
})

test('App compara su build con la actualización publicada antes de avisar',()=>{
 assert.match(update,/VITE_ANDROID_BUILD_SHA/)
 assert.match(update,/releases\/tags\/android-latest/)
 assert.match(update,/latest===BUILD_SHA/)
 assert.match(update,/Actualización disponible/)
 assert.match(update,/isAndroidNative/)
})

test('actualizador forma parte del runtime sin agregar otro menú',()=>{
 assert.match(main,/MobileUpdateNotice/)
 assert.doesNotMatch(update,/mobile-bottom-nav/)
})
