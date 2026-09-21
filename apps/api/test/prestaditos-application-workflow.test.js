import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const applicationMigration=read('supabase/migrations/20260921170500_prestaditos_application_workflow.sql')
const formalizationMigration=read('supabase/migrations/20260921173500_prestaditos_formalization_integrity.sql')
const applicationsPanel=read('apps/web/src/PrestaditosApplicationsPanel.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')

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
