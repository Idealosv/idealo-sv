import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const applicationMigration=read('supabase/migrations/20260921170500_prestaditos_application_workflow.sql')
const formalizationMigration=read('supabase/migrations/20260921173500_prestaditos_formalization_integrity.sql')
const applicationsPanel=read('apps/web/src/PrestaditosApplicationsPanel.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const investmentsPanel=read('apps/web/src/PrestaditosInvestmentsPanel.jsx')
const investmentControls=read('supabase/migrations/20260921181000_prestaditos_investment_controls.sql')
const paymentsPanel=read('apps/web/src/PrestaditosPaymentsPanel.jsx')
const paymentLedger=read('supabase/migrations/20260921184500_prestaditos_payment_ledger.sql')
const maturitiesPanel=read('apps/web/src/PrestaditosMaturitiesPanel.jsx')
const beneficiariesPanel=read('apps/web/src/PrestaditosBeneficiariesPanel.jsx')
const beneficiaryControls=read('supabase/migrations/20260921192000_prestaditos_beneficiaries_advanced.sql')
const renewalsPanel=read('apps/web/src/PrestaditosRenewalsPanel.jsx')
const renewalControls=read('supabase/migrations/20260921194500_prestaditos_renewal_decisions.sql')
const treasuryPanel=read('apps/web/src/PrestaditosTreasuryPanel.jsx')
const documentsPanel=read('apps/web/src/PrestaditosDocumentsPanel.jsx')
const documentRepository=read('supabase/migrations/20260921201500_prestaditos_document_repository.sql')
const reportsPanel=read('apps/web/src/PrestaditosReportsPanel.jsx')
const auditPanel=read('apps/web/src/PrestaditosAuditPanel.jsx')
const configurationPanel=read('apps/web/src/PrestaditosConfigurationPanel.jsx')
const companySettings=read('supabase/migrations/20260921205000_prestaditos_company_settings.sql')

test('solicitudes conservan trazabilidad y separación entre solicitado y aprobado',()=>{
 assert.match(applicationMigration,/application_code text/)
 assert.match(applicationMigration,/approved_amount numeric\(14,2\)/)
 assert.match(applicationMigration,/approved_term_months integer/)
 assert.match(applicationMigration,/create table if not exists public\.inv_application_events/)
 assert.match(applicationMigration,/decision_notes/)
})

test('flujo de solicitud impide saltos de estado y restringe decisiones',()=>{
 assert.match(applicationMigration,/old\.status='PENDING' and new\.status='REVIEW'/)
 assert.match(applicationMigration,/old\.status='REVIEW' and new\.status in \('APPROVED','REJECTED'\)/)
 assert.match(applicationMigration,/old\.status='APPROVED' and new\.status='SIGNATURE'/)
 assert.match(applicationMigration,/old\.status='SIGNATURE' and new\.status='FUNDS_RECEIVED'/)
 assert.match(applicationMigration,/old\.status='FUNDS_RECEIVED' and new\.status='ACTIVE'/)
 assert.match(applicationMigration,/lower\(coalesce\(cm\.role,''\)\) in \('owner','admin'\)/)
 assert.match(applicationMigration,/Indicá el motivo del rechazo/)
})

test('formalización es única y atómica desde fondos recibidos',()=>{
 assert.match(formalizationMigration,/create unique index if not exists inv_investments_application_uidx/)
 assert.match(formalizationMigration,/v_app\.status<>'FUNDS_RECEIVED'/)
 assert.match(formalizationMigration,/insert into public\.inv_investments/)
 assert.match(formalizationMigration,/update public\.inv_applications\s+set status='ACTIVE'/s)
 assert.match(formalizationMigration,/revoke insert,delete on public\.inv_investments from authenticated/)
})

test('interfaz de solicitudes usa RPC controlada y exige motivo de rechazo',()=>{
 assert.match(applicationsPanel,/supabase\.rpc\('inv_transition_application'/)
 assert.match(applicationsPanel,/Motivo del rechazo \*/)
 assert.match(applicationsPanel,/Fondos recibidos/)
 assert.match(applicationsPanel,/Formalizar inversión/)
 assert.match(applicationsPanel,/inv_application_events/)
})

test('interfaz de inversiones formaliza por RPC sin insertar inversión directamente',()=>{
 assert.match(investmentsPanel,/supabase\.rpc\('inv_formalize_application_with_rate'/)
 assert.doesNotMatch(investmentsPanel,/from\('inv_investments'\)\.insert/)
 assert.match(investmentsPanel,/x\.status==='FUNDS_RECEIVED'/)
 assert.match(investmentsPanel,/capital y el plazo vienen de la aprobación/)
})


test('módulo de inversiones conserva capital y plazo formalizados',()=>{
 assert.match(investmentsPanel,/Capital aprobado/)
 assert.match(investmentsPanel,/Plazo aprobado/)
 assert.match(investmentsPanel,/No editable/)
 assert.match(investmentsPanel,/supabase\.rpc\('inv_formalize_application_with_rate'/)
 assert.doesNotMatch(investmentsPanel,/from\('inv_investments'\)\.insert/)
})

test('módulo de inversiones muestra expediente, beneficiarios y pagos',()=>{
 assert.match(investmentsPanel,/EXPEDIENTE DE INVERSIÓN/)
 assert.match(investmentsPanel,/Beneficiarios del inversionista/)
 assert.match(investmentsPanel,/Historial de pagos de esta inversión/)
 assert.match(investmentsPanel,/Vencen en 30 días/)
})

test('edición operativa de inversión está restringida y auditada',()=>{
 assert.match(investmentControls,/public\.inv_company_can_review/)
 assert.match(investmentControls,/INVESTMENT_DETAILS_UPDATED/)
 assert.match(investmentControls,/projected_gain/)
 assert.match(investmentsPanel,/supabase\.rpc\('inv_update_investment_details'/)
})


test('libro de pagos no elimina movimientos y permite reversión auditada',()=>{
 assert.match(paymentLedger,/status text not null default 'POSTED'/)
 assert.match(paymentLedger,/INVESTOR_PAYMENT_REVERSED/)
 assert.match(paymentLedger,/Indicá el motivo de la reversión/)
 assert.match(paymentLedger,/revoke insert,update,delete on public\.inv_payments from authenticated/)
})

test('devolución de capital no puede superar el principal pendiente',()=>{
 assert.match(paymentLedger,/v_returned\+p_amount>v_investment\.principal/)
 assert.match(paymentLedger,/La devolución de capital supera el capital pendiente/)
 assert.match(paymentsPanel,/outstandingCapital/)
})

test('interfaz de pagos usa RPC controladas y mantiene historial',()=>{
 assert.match(paymentsPanel,/supabase\.rpc\('inv_record_payment'/)
 assert.match(paymentsPanel,/supabase\.rpc\('inv_reverse_payment'/)
 assert.match(paymentsPanel,/El pago no se eliminará/)
 assert.match(paymentsPanel,/HISTORIAL DE PAGOS/)
 assert.doesNotMatch(paymentsPanel,/from\('inv_payments'\)\.insert/)
})


test('control de vencimientos clasifica ventanas críticas sin alterar contratos',()=>{
 assert.match(maturitiesPanel,/Próximos 7 días/)
 assert.match(maturitiesPanel,/Próximos 30 días/)
 assert.match(maturitiesPanel,/Próximos 90 días/)
 assert.match(maturitiesPanel,/llegar a la fecha de vencimiento no renueva ni cierra la inversión automáticamente/)
 assert.match(maturitiesPanel,/Gestionar vencimiento/)
})


test('beneficiarios avanzados conservan historial y control de porcentaje',()=>{
 assert.match(beneficiaryControls,/beneficiary_code text/)
 assert.match(beneficiaryControls,/BENEFICIARY_UPDATED/)
 assert.match(beneficiaryControls,/BENEFICIARY_DEACTIVATED/)
 assert.match(beneficiaryControls,/El porcentaje total de beneficiarios activos no puede superar 100/)
 assert.match(beneficiaryControls,/revoke insert,update,delete on public\.inv_beneficiaries from authenticated/)
 assert.match(beneficiariesPanel,/no obliga a completar 100%/)
 assert.match(beneficiariesPanel,/supabase\.rpc\('inv_save_beneficiary'/)
 assert.match(beneficiariesPanel,/supabase\.rpc\('inv_set_beneficiary_active'/)
})

test('renovaciones registran decisión sin ejecutar automáticamente una inversión',()=>{
 assert.match(renewalControls,/create table if not exists public\.inv_renewal_decisions/)
 assert.match(renewalControls,/RENEW_CAPITAL_YIELD/)
 assert.match(renewalControls,/WITHDRAW/)
 assert.match(renewalControls,/v_days>30/)
 assert.match(renewalsPanel,/Esta etapa solo registra la decisión/)
 assert.match(renewalsPanel,/No cierra la inversión anterior ni crea una nueva automáticamente/)
 assert.match(renewalsPanel,/supabase\.rpc\('inv_save_renewal_decision'/)
 assert.match(renewalsPanel,/supabase\.rpc\('inv_cancel_renewal_decision'/)
})


test('tesorería consolida únicamente movimientos de inversionistas',()=>{
 assert.match(treasuryPanel,/Entrada de capital/)
 assert.match(treasuryPanel,/Pago de rendimiento/)
 assert.match(treasuryPanel,/Devolución de capital/)
 assert.match(treasuryPanel,/Solo movimientos de inversionistas/)
 assert.match(treasuryPanel,/Una entrada de capital nace de una inversión formalizada/)
 assert.match(treasuryPanel,/row\.status==='REVERSED'/)
})


test('repositorio documental es privado, auditable y no elimina historial',()=>{
 assert.match(documentRepository,/create table if not exists public\.inv_documents/)
 assert.match(documentRepository,/DOCUMENT_RECORDED/)
 assert.match(documentRepository,/DOCUMENT_INACTIVATED/)
 assert.match(documentRepository,/revoke insert,update,delete on public\.inv_documents from authenticated/)
 assert.match(documentsPanel,/createSignedUrl/)
 assert.match(documentsPanel,/No se eliminará el archivo/)
 assert.match(documentsPanel,/Máximo 10 MB/)
})


test('reportes gerenciales incluyen filtros y exportación sin mutar datos',()=>{
 assert.match(reportsPanel,/REPORTES GERENCIALES/)
 assert.match(reportsPanel,/Exportar CSV/)
 assert.match(reportsPanel,/Inversiones/)
 assert.match(reportsPanel,/Inversionistas/)
 assert.match(reportsPanel,/Solicitudes/)
 assert.match(reportsPanel,/Pagos/)
 assert.match(reportsPanel,/Vencimientos/)
 assert.match(reportsPanel,/Renovaciones/)
 assert.match(reportsPanel,/Documentos/)
 assert.match(reportsPanel,/Blob/)
})

test('auditoría permite filtrar, inspeccionar y exportar trazabilidad',()=>{
 assert.match(auditPanel,/Auditoría del ERP/)
 assert.match(auditPanel,/Quién hizo qué, cuándo y sobre qué expediente/)
 assert.match(auditPanel,/Exportar CSV/)
 assert.match(auditPanel,/Ver detalle/)
 assert.match(auditPanel,/DETALLE DE AUDITORÍA/)
 assert.match(auditPanel,/últimos 250 eventos/)
})


test('configuración operativa no inventa fórmula financiera',()=>{
 assert.match(companySettings,/MANUAL_PENDING_RULE/)
 assert.match(companySettings,/allowed_term_months/)
 assert.match(companySettings,/payment_methods/)
 assert.match(companySettings,/payment_places/)
 assert.match(companySettings,/CONFIGURATION_UPDATED/)
 assert.match(configurationPanel,/10% · 12% · 15%/)
 assert.match(configurationPanel,/no se asume qué porcentaje corresponde/i)
})

test('configuración restringe cambios y expone permisos efectivos',()=>{
 assert.match(companySettings,/public\.inv_company_can_review/)
 assert.match(companySettings,/revoke insert,update,delete on public\.inv_company_settings from authenticated/)
 assert.match(configurationPanel,/PERMISOS EFECTIVOS/)
 assert.match(configurationPanel,/Solo propietario o administrador/)
 assert.match(configurationPanel,/Cambiar los roles de usuarios se administra desde IDEALO SV/)
})
