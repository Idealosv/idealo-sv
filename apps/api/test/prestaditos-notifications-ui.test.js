import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const panel=read('apps/web/src/PrestaditosAlertsPanel.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('notificaciones muestra centro ejecutivo con contadores por vista',()=>{
 assert.match(panel,/Centro de notificaciones/)
 assert.match(panel,/viewCounts/)
 assert.match(panel,/Abiertas/)
 assert.match(panel,/Revisadas/)
 assert.match(panel,/Archivadas/)
 assert.match(panel,/Marcar revisada/)
})

test('vista previa de notificaciones permite mover estados',()=>{
 assert.match(preview,/function Notifications\(\{onGo\}\)/)
 assert.match(preview,/setStates/)
 assert.match(preview,/DISMISSED/)
 assert.match(preview,/Restaurar/)
 assert.match(preview,/Todas las prioridades/)
})

test('notificaciones usa tipografia legible y acciones claras',()=>{
 assert.match(css,/NOTIFICATIONS MODULE · EXECUTIVE UI/)
 assert.match(css,/prst-alert-copy>strong\{[\s\S]*font-size:15px/)
 assert.match(css,/prst-alert-summary strong\{[\s\S]*font-size:31px/)
 assert.match(css,/prst-notification-actions button\.primary/)
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
})


test('notificaciones reduce espacio vacio y mejora legibilidad interna',()=>{
 assert.match(css,/NOTIFICATIONS POLISH · COMPACT \+ LEGIBLE/)
 assert.match(css,/prst-alert-summary strong\{[\s\S]*font-size:26px!important/)
 assert.match(css,/prst-alert-copy>strong\{[\s\S]*font-size:16px!important/)
 assert.match(css,/grid-template-columns:minmax\(260px,380px\) 180px 180px auto!important/)
 assert.match(css,/prst-notification-actions button\{[\s\S]*min-height:34px!important/)
})


test('notificaciones aplica pulido final de alineacion y contraste',()=>{
 assert.match(css,/NOTIFICATIONS FINAL POLISH/)
 assert.match(css,/grid-template-columns:minmax\(260px,360px\) 170px 170px auto!important/)
 assert.match(css,/prst-alert-copy>small\{[\s\S]*color:#536273!important/)
 assert.match(css,/prst-notification-rules-card\{[\s\S]*padding:16px 18px!important/)
 assert.match(css,/prst-notification-rules-card \.prst-alert-rules span\{[\s\S]*min-height:42px!important/)
})
