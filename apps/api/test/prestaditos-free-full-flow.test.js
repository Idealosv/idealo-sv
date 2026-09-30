import test from 'node:test'
import assert from 'node:assert/strict'
import { PRESTADITOS_FREE_QA_CASES, summarizeFreeQaCase } from '../../web/src/prestaditos-free-qa-fixtures.js'

test('los tres casos ficticios gratuitos cubren 10%, 12% y 15% anual',()=>{
 const rates=PRESTADITOS_FREE_QA_CASES.map(x=>x.investment.agreed_return_rate)
 assert.deepEqual(rates,[10,12,15])
 for(const qa of PRESTADITOS_FREE_QA_CASES){
  assert.equal(qa.investment.term_months,12)
  assert.equal(qa.investment.return_rate_basis,'ANNUAL')
  assert.equal(qa.contract.rate_basis,'ANNUAL')
  assert.equal(qa.contract.status,'SIGNED')
  assert.ok(qa.contract.signed_document_id)
 }
})

test('caso 10% recorre pago de rendimiento, devolución total y retiro',()=>{
 const qa=PRESTADITOS_FREE_QA_CASES.find(x=>x.key==='QA-10')
 const summary=summarizeFreeQaCase(qa)
 assert.equal(summary.annualGain,200)
 assert.equal(summary.yieldPaid,200)
 assert.equal(summary.capitalReturned,2000)
 assert.equal(summary.endingCapital,0)
 assert.equal(qa.renewal.decision_type,'WITHDRAW')
 assert.equal(qa.renewal.status,'EXECUTED')
})

test('caso 12% recorre rendimiento y renovación con inversión sucesora',()=>{
 const qa=PRESTADITOS_FREE_QA_CASES.find(x=>x.key==='QA-12')
 const summary=summarizeFreeQaCase(qa)
 assert.equal(summary.annualGain,900)
 assert.equal(summary.yieldPaid,900)
 assert.equal(summary.capitalReturned,0)
 assert.equal(summary.endingCapital,7500)
 assert.equal(qa.investment.status,'RENEWED')
 assert.equal(qa.renewal.successor_investment_id,qa.successor.id)
 assert.equal(qa.successor.status,'ACTIVE')
})

test('caso 15% recorre rendimiento, devolución de capital y cierre',()=>{
 const qa=PRESTADITOS_FREE_QA_CASES.find(x=>x.key==='QA-15')
 const summary=summarizeFreeQaCase(qa)
 assert.equal(summary.annualGain,2250)
 assert.equal(summary.yieldPaid,2250)
 assert.equal(summary.capitalReturned,15000)
 assert.equal(summary.endingCapital,0)
 assert.equal(qa.investment.status,'CLOSED')
})

test('ningún caso ficticio usa nombres reales ni datos de producción',()=>{
 for(const qa of PRESTADITOS_FREE_QA_CASES){
  assert.match(qa.investor.last_names,/Prueba/)
  assert.match(qa.investor.investor_code,/^QA-/)
  assert.match(qa.investment.investment_code,/^QA-/)
  assert.match(qa.contract.contract_code,/^QA-/)
 }
})
