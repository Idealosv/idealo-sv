import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pkg=JSON.parse(fs.readFileSync(new URL('../../web/package.json',import.meta.url),'utf8'))
const cap=JSON.parse(fs.readFileSync(new URL('../../web/capacitor.config.json',import.meta.url),'utf8'))
const guard=fs.readFileSync(new URL('../../web/src/MobileRuntimeGuard.jsx',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../../web/src/mobile-native-shell.css',import.meta.url),'utf8')

test('App Android usa Capacitor 8 y plataforma nativa',()=>{
  assert.match(pkg.dependencies['@capacitor/core'],/^\^8\./)
  assert.match(pkg.dependencies['@capacitor/android'],/^\^8\./)
  assert.match(pkg.devDependencies['@capacitor/cli'],/^\^8\./)
  assert.equal(cap.appId,'sv.idealo.erp')
  assert.equal(cap.appName,'IDEALO SV')
  assert.equal(cap.webDir,'dist')
})

test('runtime distingue Android nativo de navegador/PWA',()=>{
  assert.match(guard,/Capacitor/)
  assert.match(guard,/isNativePlatform/)
  assert.match(guard,/getPlatform/)
  assert.match(guard,/idealo-native-android/)
})

test('Android nativo elimina chrome visual de navegador',()=>{
  assert.match(css,/html\.idealo-native-android/)
  assert.match(css,/display:none!important/)
  assert.match(css,/height:100dvh!important/)
  assert.match(css,/box-shadow:none!important/)
})

test('scripts permiten crear sincronizar y abrir proyecto Android',()=>{
  assert.match(pkg.scripts['android:init'],/cap add android/)
  assert.match(pkg.scripts['android:sync'],/cap sync android/)
  assert.match(pkg.scripts['android:open'],/cap open android/)
})
