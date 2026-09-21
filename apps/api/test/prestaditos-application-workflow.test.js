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
 assert.match(host,/supabase\.rpc\('inv_formalize_application'/)
 assert.doesNotMatch(host,/from\('inv_investments'\)\.insert/)
 assert.match(host,/x\.status==='FUNDS_RECEIVED'/)
 assert.match(host,/capital y el plazo se toman de la aprobación/)
})


test('módulo de inversiones conserva capital y plazo formalizados',()=>{
 assert.match(investmentsPanel,/Capital aprobado/)
 assert.match(investmentsPanel,/Plazo aprobado/)
 assert.match(investmentsPanel,/No editable/)
 assert.match(investmentsPanel,/supabase\.rpc\('inv_formalize_application'/)
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
