import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const guard=fs.readFileSync(new URL('../../web/src/MobileRuntimeGuard.jsx',import.meta.url),'utf8')
const main=fs.readFileSync(new URL('../../web/src/main.jsx',import.meta.url),'utf8')
const sw=fs.readFileSync(new URL('../../web/public/sw.js',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../../web/src/mobile-native-shell.css',import.meta.url),'utf8')

test('runtime móvil abre /mobile y PWA Android en modo dedicado',()=>{
  assert.match(guard,/Android\|iPhone\|iPad\|iPod\|Mobile/)
  assert.match(guard,/display-mode: standalone/)
  assert.match(guard,/pathname==='\/mobile'/)
  assert.match(guard,/idealo-module-change/)
  assert.match(guard,/App móviles/)
  assert.match(main,/MobileRuntimeGuard/)
})

test('abrir App móviles sincroniza la URL con /mobile',()=>{
  assert.match(guard,/history\.pushState/)
  assert.match(guard,/`\/mobile/)
  assert.match(guard,/popstate/)
})

test('service worker deja de servir JS y CSS viejos primero',()=>{
  assert.match(sw,/idealo-mobile-v5/)
  assert.match(sw,/fetch\(request\)\.then/)
  assert.doesNotMatch(sw,/caches\.match\(request\)\.then\(\(cached\)=>cached\|\|fetch/)
  assert.match(main,/updateViaCache:'none'/)
})

test('modo móvil aísla scroll y usa alto real del dispositivo',()=>{
  assert.match(css,/html\.idealo-mobile-runtime,body\.idealo-mobile-runtime/)
  assert.match(css,/height:100dvh/)
  assert.match(css,/-webkit-overflow-scrolling:touch/)
})
