import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const panel=read('apps/web/src/PrestaditosAlertsPanel.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('notificaciones conserva estados y acciones operativas',()=>{
 assert.match(panel,/viewCounts/)
 assert.match(panel,/Abiertas/)
 assert.match(panel,/Revisadas/)
 assert.match(panel,/Archivadas/)
 assert.match(panel,/Marcar revisada/)
 assert.match(panel,/inv_set_notification_state/)
 assert.match(panel,/inv_clear_notification_state/)
})

test('centro de notificaciones usa workspace profesional de dos columnas',()=>{
 assert.match(panel,/prst-notification-workspace/)
 assert.match(panel,/prst-notification-feed/)
 assert.match(panel,/prst-notification-insights/)
 assert.match(panel,/PRIORIDADES ABIERTAS/)
 assert.match(panel,/VIGILANCIA AUTOMÁTICA/)
 assert.match(panel,/prst-notification-rule-list/)
})

test('filtros pueden limpiarse sin alterar datos',()=>{
 assert.match(panel,/hasFilters/)
 assert.match(panel,/clearFilters/)
 assert.match(panel,/Limpiar/)
 assert.match(preview,/clearFilters/)
})

test('vista previa mantiene interacción por estados',()=>{
 assert.match(preview,/function Notifications\(\{onGo\}\)/)
 assert.match(preview,/setStates/)
 assert.match(preview,/DISMISSED/)
 assert.match(preview,/Restaurar/)
 assert.match(preview,/filtered\.length/)
})

test('notificaciones usa diseño compacto y legible',()=>{
 assert.match(css,/NOTIFICATIONS MODULE · PROFESSIONAL WORKSPACE/)
 assert.match(css,/grid-template-columns:minmax\(0,1\.7fr\) minmax\(270px,\.63fr\)/)
 assert.match(css,/prst-alert-summary strong\{[\s\S]*font-size:24px/)
 assert.match(css,/prst-alert-copy>strong\{[\s\S]*font-size:14px/)
 assert.match(css,/prst-notification-rule-list/)
 assert.match(css,/prst-priority-overview/)
})
