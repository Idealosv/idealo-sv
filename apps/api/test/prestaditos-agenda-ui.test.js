import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const agenda=read('apps/web/src/PrestaditosAgendaPanel.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('agenda muestra ventanas operativas con contadores',()=>{
 assert.match(agenda,/viewCounts/)
 assert.match(agenda,/Hoy \/ vencidos/)
 assert.match(agenda,/7 días/)
 assert.match(agenda,/30 días/)
 assert.match(agenda,/Buscar evento o inversionista/)
})

test('vista previa de agenda es interactiva',()=>{
 assert.match(preview,/function Agenda\(\{onGo\}\)/)
 assert.match(preview,/setView/)
 assert.match(preview,/setSearch/)
 assert.match(preview,/setType/)
 assert.match(preview,/onGo\?\.\(row\.tab\)/)
})

test('agenda usa interfaz ejecutiva legible',()=>{
 assert.match(css,/AGENDA MODULE · EXECUTIVE UI/)
 assert.match(css,/prst-agenda-summary strong\{[\s\S]*font-size:30px/)
 assert.match(css,/prst-agenda-copy>strong\{[\s\S]*font-size:15px/)
 assert.match(css,/prst-agenda-date b\{[\s\S]*font-size:15px/)
 assert.match(css,/prst-agenda-list>article>button\{[\s\S]*min-height:40px/)
})
