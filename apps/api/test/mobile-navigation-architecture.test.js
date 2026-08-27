import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app=fs.readFileSync(new URL('../../web/src/MobileAppHost.jsx',import.meta.url),'utf8')
const main=fs.readFileSync(new URL('../../web/src/main.jsx',import.meta.url),'utf8')
const simpleCss=fs.readFileSync(new URL('../../web/src/mobile-simple-navigation.css',import.meta.url),'utf8')

test('Android usa una barra inferior simple de cuatro destinos',()=>{
 for(const label of ['Inicio','Trabajo','Clientes','Más']) assert.match(app,new RegExp(label))
 assert.match(app,/const tabs=\['Inicio','Trabajo','Clientes','Más'\]/)
})

test('Trabajo agrupa producción y agenda; Clientes agrupa cotizaciones',()=>{
 assert.match(app,/workView/)
 assert.match(app,/clientView/)
 for(const label of ['Producción','Agenda','Cotizaciones']) assert.match(app,new RegExp(label))
})

test('Más es una pantalla normal y elimina gestión flotante duplicada',()=>{
 assert.match(app,/tab==='Más'/)
 assert.match(app,/MobileOwnerHub/)
 assert.doesNotMatch(main,/MobileOwnerHubHost/)
 assert.match(simpleCss,/\.mobile-dte-fab\{display:none!important\}/)
 assert.match(simpleCss,/\.mobile-owner-fab\{display:none!important\}/)
})
