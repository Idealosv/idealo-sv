import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const investors=read('apps/web/src/PrestaditosInvestorsPanel.jsx')
const applications=read('apps/web/src/PrestaditosApplicationsPanel.jsx')
const reports=read('apps/web/src/PrestaditosReportsPanel.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('menu lateral contiene solo ocho modulos principales',()=>{
 for(const source of [preview,host]){
  assert.match(source,/const MAIN_TABS=\['Dashboard','Inversionistas','Solicitudes','Inversiones','Rendimientos','Vencimientos','Tesorería','Reportes'\]/)
  assert.match(source,/MAIN_TABS\.map\(navButton\)/)
  assert.doesNotMatch(source,/Más operación/)
  assert.doesNotMatch(source,/<summary>Administración/)
 }
})

test('operaciones secundarias pasan a acciones contextuales',()=>{
 for(const source of [preview,host]){
  assert.match(source,/const MODULE_ACTIONS=/)
  assert.match(source,/Dashboard:\['Notificaciones','Agenda'\]/)
  assert.match(source,/Inversionistas:\['Perfil 360','Beneficiarios','Documentos'\]/)
  assert.match(source,/Solicitudes:\['Simulador'\]/)
  assert.match(source,/Inversiones:\['Contratos'\]/)
  assert.match(source,/Rendimientos:\['Estado de cuenta'\]/)
  assert.match(source,/Vencimientos:\['Renovaciones'\]/)
  assert.match(source,/Tesorería:\['Cierre mensual','Exportaciones'\]/)
  assert.match(source,/Reportes:\['Auditoría','Auditoría técnica'\]/)
  assert.match(source,/prst-context-bar/)
 }
})

test('perfil 360 deja de ser modulo y queda como boton del inversionista',()=>{
 assert.match(investors,/onClick=\{\(\)=>goProfile\(x\)\}>Perfil 360<\/button>/)
 assert.match(preview,/onClick=\{\(\)=>onOpenInvestor\?\.\('Perfil 360',x\.id\)\}>Perfil 360<\/button>/)
 assert.doesNotMatch(host,/MAIN_TABS=.*Perfil 360/)
 assert.doesNotMatch(preview,/MAIN_TABS=.*Perfil 360/)
})

test('herramientas del sistema salen del menu lateral',()=>{
 for(const source of [preview,host]){
  assert.match(source,/const SYSTEM_TABS=\['Configuración','Ayuda','Prueba integral','Preparación'\]/)
  assert.match(source,/prst-system-menu/)
 }
})

test('navegacion relacionada de inversionistas sigue conectada',()=>{
 assert.match(host,/onNavigate=\{goFromAlert\}/)
 assert.match(investors,/goProfile/)
 assert.match(investors,/goDocuments/)
 assert.match(investors,/goContracts/)
})

test('estilos soportan la arquitectura simplificada',()=>{
 assert.match(css,/CORE ERP NAVIGATION · 8 MODULES/)
 assert.match(css,/prst-context-bar/)
 assert.match(css,/prst-system-menu/)
 assert.match(css,/prst-action-menu/)
 assert.match(css,/prst-investor-actions\.compact/)
})


test('solicitudes evita botonera repetida por fila',()=>{
 assert.match(applications,/className="primary" onClick=\{\(\)=>setSelectedId\(row\.id\)\}>Gestionar<\/button>/)
 assert.doesNotMatch(applications,/row\.status==='REVIEW'&&<><button type="button" className="approve"/)
})

test('reportes usa selector en vez de una fila de siete botones',()=>{
 assert.match(reports,/prst-report-picker/)
 assert.match(reports,/<select value=\{report\} onChange=\{e=>setReport\(e\.target\.value\)\}>/)
 assert.doesNotMatch(reports,/className="prst-report-tabs"/)
 assert.match(css,/SIMPLE REPORT PICKER/)
})


test('editor de inversionista abre como modal y no empuja el contenido',()=>{
 assert.match(investors,/prst-editor-backdrop/)
 assert.match(investors,/prst-editor-modal/)
 assert.match(preview,/prst-editor-backdrop/)
 assert.match(preview,/prst-editor-modal-preview/)
 assert.match(css,/INVESTOR EDITOR MODAL · CLEAN WORKSPACE/)
})

test('acciones superiores se mantienen en una sola fila',()=>{
 assert.match(css,/\.prst-top-actions\{[\s\S]*flex-direction:row!important/)
 assert.match(css,/flex-wrap:nowrap!important/)
})
