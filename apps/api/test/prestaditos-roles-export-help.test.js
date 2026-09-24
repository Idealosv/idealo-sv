import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canPrestaditos, prestaditosRoleLabel, prestaditosRoleLevel } from '../../web/src/prestaditos-permissions.js'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const migration=read('supabase/migrations/20260921231500_prestaditos_role_permissions.sql')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const configuration=read('apps/web/src/PrestaditosConfigurationPanel.jsx')
const exportPanel=read('apps/web/src/PrestaditosExportPanel.jsx')
const help=read('apps/web/src/PrestaditosHelpPanel.jsx')
const investors=read('apps/web/src/PrestaditosInvestorsPanel.jsx')
const docs=read('apps/web/src/PrestaditosDocumentsPanel.jsx')
const apps=read('apps/web/src/PrestaditosApplicationsPanel.jsx')

test('roles se normalizan a propietario administrador operador y solo lectura',()=>{
 assert.equal(prestaditosRoleLevel('owner'),'OWNER')
 assert.equal(prestaditosRoleLevel('admin'),'ADMIN')
 assert.equal(prestaditosRoleLevel('staff'),'OPERATOR')
 assert.equal(prestaditosRoleLevel('operator'),'OPERATOR')
 assert.equal(prestaditosRoleLevel('viewer'),'READ_ONLY')
 assert.equal(prestaditosRoleLabel('staff'),'Operador')
 assert.equal(prestaditosRoleLabel('member'),'Solo lectura')
})

test('operador puede expedientes solicitudes documentos y exportar pero no decisiones financieras',()=>{
 for(const permission of ['VIEW','EDIT_INVESTOR','CREATE_APPLICATION','UPLOAD_DOCUMENT'])assert.equal(canPrestaditos('staff',permission),true)
 for(const permission of ['REVIEW_APPLICATION','FORMALIZE_INVESTMENT','REGISTER_PAYMENT','REVERSE_PAYMENT','MANAGE_BENEFICIARY','MANAGE_RENEWAL','MONTHLY_CLOSEOUT','CONFIGURE'])assert.equal(canPrestaditos('staff',permission),false)
 assert.equal(canPrestaditos('viewer','VIEW'),true)
 assert.equal(canPrestaditos('staff','EXPORT'),false)
 assert.equal(canPrestaditos('viewer','EXPORT'),false)
 assert.equal(canPrestaditos('viewer','EDIT_INVESTOR'),false)
})

test('base protege expedientes y storage contra solo lectura',()=>{
 assert.match(migration,/inv_company_access_level/)
 assert.match(migration,/staff'.*'OPERATOR'/s)
 assert.match(migration,/inv_company_can_operate/)
 assert.match(migration,/create policy inv_investor_insert/)
 assert.match(migration,/with check\(public\.inv_company_can_operate\(company_id\)\)/i)
 assert.match(migration,/revoke delete on public\.inv_investors from authenticated/)
 assert.match(migration,/investor_documents_insert/)
 assert.match(migration,/inv_company_can_operate\(\(split_part\(name,'\/',1\)\)::uuid\)/)
})

test('matriz visible coincide con permisos conservadores',()=>{
 assert.match(configuration,/Propietario/)
 assert.match(configuration,/Administrador/)
 assert.match(configuration,/Operador/)
 assert.match(configuration,/Solo lectura/)
 assert.match(configuration,/Registrar pagos','Sí','Sí','No','No'/)
 assert.match(configuration,/Cargar documentos','Sí','Sí','Sí','No'/)
 assert.match(configuration,/Exportar información','Sí','Sí','No','No'/)
})

test('exportación total incluye datos estructurados y excluye binarios privados',()=>{
 assert.match(host,/\['Exportaciones','Respaldo y CSV'\]/)
 assert.match(host,/tab==='Exportaciones'/)
 assert.match(exportPanel,/Descargar respaldo JSON/)
 assert.match(exportPanel,/inversionistas:investors/)
 assert.match(exportPanel,/auditoria:audit/)
 assert.match(exportPanel,/cierres_mensuales:closeouts/)
 assert.match(exportPanel,/no incluye los archivos binarios/i)
 assert.match(exportPanel,/restauración automática no está habilitada/i)
})

test('manual y capacitación cubren procesos principales sin cerrar reglas pendientes',()=>{
 assert.match(host,/\['Ayuda','Manual y capacitación'\]/)
 assert.match(host,/tab==='Ayuda'/)
 for(const phrase of ['Registrar un inversionista','Registrar una solicitud','Formalizar una inversión','Registrar un pago','Gestionar una renovación','Generar cierre mensual'])assert.match(help,new RegExp(phrase))
 assert.match(help,/Modo capacitación/)
 assert.match(help,/plazos distintos de 12 meses/i)
 assert.match(help,/contrato legal definitivo/i)
})

test('UI bloquea mutaciones de expediente en solo lectura y mantiene operador de captura',()=>{
 assert.match(investors,/canPrestaditos\(role,'EDIT_INVESTOR'\)/)
 assert.match(investors,/disabled=\{saving\|\|!canEdit\}/)
 assert.match(investors,/x\.status\|\|'POSTED'\)==='POSTED'/)
 assert.match(docs,/owner','admin','staff','operator/)
 assert.match(apps,/owner','admin','staff','operator/)
})
