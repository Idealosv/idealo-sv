import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8')
const panel=read('apps/web/src/PrestaditosInvestorsPanel.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const preview=read('apps/web/src/PrestaditosPreviewApp.jsx')
const css=read('apps/web/src/prestaditos-investors.css')

test('directorio de inversionistas incorpora resumen financiero y documental',()=>{
 assert.match(panel,/CONTROL DE EXPEDIENTES/)
 assert.match(panel,/Capital activo/)
 assert.match(panel,/Documentación pendiente/)
 assert.match(panel,/investorInvestmentMap/)
 assert.match(panel,/activeInvestments/)
})

test('directorio permite buscar filtrar exportar y limpiar filtros',()=>{
 assert.match(panel,/Exportar CSV/)
 assert.match(panel,/exportCsv/)
 assert.match(panel,/Documentación completa/)
 assert.match(panel,/Documentación pendiente/)
 assert.match(panel,/clearFilters/)
 assert.match(panel,/Limpiar/)
})

test('tabla de inversionistas muestra expediente documentos capital y acciones',()=>{
 assert.match(panel,/Identificación \/ contacto/)
 assert.match(panel,/prst-doc-progress/)
 assert.match(panel,/Inversiones/)
 assert.match(panel,/Capital activo/)
 assert.match(panel,/Perfil 360/)
 assert.match(panel,/Documentos/)
 assert.match(panel,/Contratos/)
})

test('registro se abre como formulario organizado por secciones',()=>{
 assert.match(panel,/formOpen/)
 assert.match(panel,/\+ Nuevo inversionista/)
 assert.match(panel,/1 · Identificación/)
 assert.match(panel,/2 · Contacto y domicilio/)
 assert.match(panel,/3 · Referencia y pago/)
 assert.match(panel,/4 · Documentos privados/)
 assert.match(panel,/Cerrar formulario/)
})

test('acciones rápidas navegan a módulos relacionados',()=>{
 assert.match(panel,/onNavigate/)
 assert.match(host,/onNavigate=\{goFromAlert\}/)
 assert.match(panel,/goProfile/)
 assert.match(panel,/goDocuments/)
 assert.match(panel,/goContracts/)
})

test('vista previa refleja el nuevo directorio profesional',()=>{
 assert.match(preview,/function Investors\(\{onGo,onOpenInvestor\}\)/)
 assert.match(preview,/prst-investor-command/)
 assert.match(preview,/prst-investor-table-pro/)
 assert.match(preview,/Documentación pendiente/)
 assert.match(preview,/Inversionistas registrados/)
})

test('estilos de inversionistas mantienen diseño ejecutivo claro',()=>{
 assert.match(css,/INVESTORS MODULE · PROFESSIONAL DIRECTORY/)
 assert.match(css,/prst-investor-summary-pro/)
 assert.match(css,/prst-investor-table-pro/)
 assert.match(css,/prst-investor-followup-grid/)
 assert.match(css,/prst-investor-form-pro/)
})


test('vista previa mantiene capital individual coherente con el resumen',()=>{
 assert.match(preview,/activeCapital=\{i1:4000,i2:8000,i3:0\}/)
 assert.match(preview,/activeCount=\{i1:1,i2:1,i3:0\}/)
 assert.match(preview,/onGo\?\.\('Contratos'\)/)
})

test('bloques inferiores conservan fondo claro y acciones menos saturadas',()=>{
 assert.match(css,/INVESTORS VISUAL POLISH · PREVIEW CONSISTENCY/)
 assert.match(css,/prst-investor-followup-list>button\{[\s\S]*background:#f8fafb!important/)
 assert.match(css,/prst-investor-actions button:not\(\.primary\)\{[\s\S]*background:#ffffff!important/)
})


test('tres acciones de fila funcionan en la vista previa',()=>{
 assert.match(preview,/onOpenInvestor\?\.\('Perfil 360',x\.id\)/)
 assert.match(preview,/onOpenInvestor\?\.\('Documentos',x\.id\)/)
 assert.match(preview,/onClick=\{\(\)=>openEdit\(x\)\}/)
 assert.match(preview,/type="button" onClick=\{\(\)=>openEdit\(x\)\}/)
})

test('perfil y documentos conservan el inversionista seleccionado',()=>{
 assert.match(preview,/selectedInvestorId/)
 assert.match(preview,/openInvestorTab/)
 assert.match(preview,/Profile360 investorId=\{selectedInvestorId\}/)
 assert.match(preview,/Documents investorId=\{selectedInvestorId\}/)
 assert.match(preview,/function Profile360\(\{investorId='i1',onGo\}\)/)
 assert.match(preview,/function Documents\(\{investorId='i1'\}\)/)
})

test('editar abre formulario funcional en la vista previa',()=>{
 assert.match(preview,/prst-preview-investor-edit/)
 assert.match(preview,/saveDraft/)
 assert.match(preview,/Guardar demo/)
 assert.match(preview,/setInvestorRows/)
})

test('estilos cubren edición y contexto seleccionado',()=>{
 assert.match(css,/INVESTOR ACTIONS · FUNCTIONAL PREVIEW/)
 assert.match(css,/prst-preview-investor-edit/)
 assert.match(css,/prst-profile360-context/)
 assert.match(css,/prst-document-context/)
})
