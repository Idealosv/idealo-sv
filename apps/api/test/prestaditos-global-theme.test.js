import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const theme=read('apps/web/src/prestaditos-theme.css')

test('ERP carga el sistema visual ejecutivo global',()=>{
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

test('tema restaura la paleta clara oficial del ERP',()=>{
 assert.match(theme,/--ui-bg:#edf1f4/)
 assert.match(theme,/--ui-surface:#ffffff/)
 assert.match(theme,/--ui-red:#d92d3e/)
 assert.match(theme,/--ui-blue:#3f6fc5/)
 assert.match(theme,/--ui-green:#24865d/)
 assert.match(theme,/--ui-amber:#c88717/)
 assert.match(theme,/--ui-purple:#7358bb/)
 assert.match(theme,/background:rgba\(255,255,255,.97\)!important/)
 assert.match(theme,/background:var\(--ui-surface\)!important/)
 assert.doesNotMatch(theme,/compact command center/)
 assert.doesNotMatch(theme,/--ui-bg:#08131f/)
})

test('tema mantiene sidebar oscuro y contenido principal claro',()=>{
 assert.match(theme,/background:linear-gradient\(180deg,#151a20 0%,#10151a 100%\)!important/)
 assert.match(theme,/\.prst-main\{background:var\(--ui-bg\)!important\}/)
 assert.match(theme,/\.prst-table-wrap table\{background:#fff!important\}/)
 assert.match(theme,/\.prst-report-tabs button\.active\{[\s\S]*background:#1f2933!important/)
})


test('tema aplica escala global más fina y menos tosca',()=>{
 assert.match(theme,/COMPACT PREMIUM SCALE · GLOBAL ERP/)
 assert.match(theme,/grid-template-columns:220px minmax\(0,1fr\)!important/)
 assert.match(theme,/prst-top-title h1\{[\s\S]*font-size:24px!important/)
 assert.match(theme,/prst-metric strong[\s\S]*font-size:21px!important/)
 assert.match(theme,/prst-sidebar nav button\{[\s\S]*min-height:34px!important/)
})
