import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const closeout=read('supabase/migrations/20260921212000_prestaditos_rates_contracts_renewals.sql')
const investments=read('apps/web/src/PrestaditosInvestmentsPanel.jsx')
const contracts=read('apps/web/src/PrestaditosContractsPanel.jsx')
const renewals=read('apps/web/src/PrestaditosRenewalsPanel.jsx')
const ocr=read('apps/web/src/PrestaditosDuiOcr.jsx')
const investors=read('apps/web/src/PrestaditosInvestorsPanel.jsx')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')

test('solo admite los porcentajes informados 10, 12 y 15 sin inventar periodicidad',()=>{
 assert.match(closeout,/p_rate in \(10,12,15\)/)
 assert.match(closeout,/PENDING_DEFINITION/)
 assert.match(investments,/RETURN_RATES=\[10,12,15\]/)
 assert.match(investments,/Porcentaje acordado/)
 assert.match(investments,/no se asume periodicidad/i)
})

test('formalización con porcentaje sigue siendo atómica',()=>{
 assert.match(closeout,/inv_formalize_application_with_rate/)
 assert.match(closeout,/from public\.inv_formalize_application\(/)
 assert.match(investments,/supabase\.rpc\('inv_formalize_application_with_rate'/)
 assert.doesNotMatch(investments,/from\('inv_investments'\)\.insert/)
})

test('contratos preparan borrador imprimible y registran documento firmado',()=>{
 assert.match(closeout,/create table if not exists public\.inv_contracts/)
 assert.match(closeout,/CONTRACT_PREPARED/)
 assert.match(closeout,/CONTRACT_SIGNED_RECORDED/)
 assert.match(contracts,/Imprimir \/ guardar PDF/)
 assert.match(contracts,/Registrar contrato firmado/)
 assert.match(contracts,/SIGNED_DOCUMENT_UPLOAD/)
 assert.match(contracts,/periodicidad específica/)
})

test('OCR del DUI exige confirmación humana y no aplica el nombre automáticamente',()=>{
 assert.match(ocr,/import\('tesseract\.js'\)/)
 assert.match(ocr,/createWorker\('spa'\)/)
 assert.match(ocr,/Confirmar y aplicar campos detectados/)
 assert.match(ocr,/El nombre se muestra como referencia y no se aplica automáticamente/)
 assert.match(investors,/PrestaditosDuiOcr/)
})

test('renovación crea sucesora de forma atómica y retiro exige capital devuelto',()=>{
 assert.match(closeout,/create or replace function public\.inv_execute_renewal/)
 assert.match(closeout,/set status='RENEWED'/)
 assert.match(closeout,/successor_investment_id=v_new\.id/)
 assert.match(closeout,/create or replace function public\.inv_finalize_withdrawal/)
 assert.match(closeout,/v_capital_returned<v_investment\.principal/)
 assert.match(closeout,/p_confirm_yield_settled/)
 assert.match(renewals,/Ejecutar renovación/)
 assert.match(renewals,/Finalizar retiro/)
})

test('flujo integral mantiene los módulos clave del vertical',()=>{
 for(const label of ['Inversionistas','Solicitudes','Inversiones','Contratos','Beneficiarios','Rendimientos','Vencimientos','Renovaciones','Tesorería','Documentos','Reportes','Auditoría','Configuración']){
  assert.match(host,new RegExp(label))
 }
})
