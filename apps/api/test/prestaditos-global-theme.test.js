import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const theme=read('apps/web/src/prestaditos-theme.css')

test('ERP carga el nuevo sistema visual ejecutivo',()=>{
 assert.match(host,/prestaditos-theme\.css/)
 assert.match(preview,/prestaditos-theme\.css/)
 assert.match(theme,/GLOBAL EXECUTIVE DESIGN SYSTEM/)
})

test('tema unifica sidebar topbar cards forms and tables',()=>{
 assert.match(theme,/\.prst-sidebar/)
 assert.match(theme,/\.prst-topbar/)
 assert.match(theme,/\.prst-card/)
 assert.match(theme,/\.prst-field input/)
 assert.match(theme,/\.prst-table-wrap/)
 assert.match(theme,/\.prst-status/)
})

test('tema mantiene paleta sobria y legible',()=>{
 assert.match(theme,/--ui-bg:#08131f/)
 assert.match(theme,/--ui-red:#ed1c24/)
 assert.match(theme,/background:#0b1824!important/)
 assert.doesNotMatch(theme,/neon|cyber/i)
})


test('tema adopta centro de control financiero oscuro',()=>{
 assert.match(theme,/compact command center/)
 assert.match(theme,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/)
 assert.match(theme,/--ui-orange:#f2a11f/)
 assert.match(theme,/background:linear-gradient\(180deg,#0f1e2b,#0d1a27\)!important/)
})


test('tema aplica aumento tipográfico moderado en todo el ERP',()=>{
 assert.match(theme,/MODERATE GLOBAL TYPE BUMP/)
 assert.match(theme,/prst-sidebar nav button strong\{font-size:12px!important\}/)
 assert.match(theme,/prst-table-wrap td\{font-size:11px!important\}/)
 assert.match(theme,/prst-field input,[\s\S]*font-size:12px!important/)
 assert.match(theme,/prst-dash-kpi strong\{font-size:21px!important\}/)
 assert.match(theme,/prst-dash-panel>header h3\{font-size:19px!important\}/)
})
