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
 assert.match(theme,/--ui-bg:#edf1f4/)
 assert.match(theme,/--ui-red:#d92d3e/)
 assert.match(theme,/background:#fff!important/)
 assert.doesNotMatch(theme,/neon|cyber/i)
})
