import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const hardening=read('supabase/migrations/20260921224500_prestaditos_security_hardening.sql')
const smoke=read('supabase/tests/prestaditos_staging_readiness.sql')
const technicalAudit=read('apps/web/src/PrestaditosTechnicalAuditPanel.jsx')
const integrity=read('apps/web/src/prestaditos-integrity.js')

test('todas las funciones inv_* se revocan a public y anon antes de conceder el mínimo necesario',()=>{
 assert.match(hardening,/p\.proname like 'inv_%'/)
 assert.match(hardening,/revoke execute on function %s from public/)
 assert.match(hardening,/revoke execute on function %s from anon/)
 assert.match(hardening,/grant execute on function public\.inv_company_member\(uuid\) to authenticated,service_role/)
 assert.match(hardening,/grant execute on function public\.inv_record_payment/)
 assert.match(hardening,/grant execute on function public\.inv_prepare_contract/)
 assert.match(hardening,/grant execute on function public\.inv_generate_monthly_closeout/)
})

test('smoke test valida RLS, bucket privado, escrituras sensibles y ausencia de RPC anon',()=>{
 assert.match(smoke,/RLS disabled/)
 assert.match(smoke,/investor-documents/)
 assert.match(smoke,/sensitive tables expose direct authenticated writes/)
 assert.match(smoke,/one or more inv_\* RPCs expose anonymous execute/)
 assert.match(smoke,/inv_save_beneficiary\(uuid,uuid,uuid/)
})

test('auditoría técnica cubre integridad crítica de capital contratos documentos y renovaciones',()=>{
 for(const token of [
  'CAPITAL_OVER_RETURNED',
  'SIGNED_WITHOUT_DOCUMENT',
  'REVERSED_WITHOUT_REASON',
  'EXECUTED_WITHOUT_SUCCESSOR',
  'DOCUMENT_WITHOUT_PATH',
  'BENEFICIARY_OVER_100',
 ]){
  assert.match(integrity,new RegExp(token))
 }
 assert.match(technicalAudit,/Integridad del vertical/)
 assert.match(technicalAudit,/ARQUITECTURA DE SEGURIDAD/)
})
