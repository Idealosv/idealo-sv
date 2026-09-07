import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workPaymentSql=fs.readFileSync(new URL('../../../supabase/migrations/20260906225500_link_internal_work_payments_to_dte_advances.sql',import.meta.url),'utf8')
const advanceSql=fs.readFileSync(new URL('../../../supabase/migrations/20260904110000_customer_advances.sql',import.meta.url),'utf8')
const paymentSql=fs.readFileSync(new URL('../../../supabase/migrations/20260823175500_receivables_cash_safe.sql',import.meta.url),'utf8')
const balanceSql=fs.readFileSync(new URL('../../../supabase/migrations/20260904164000_fix_receivable_balance_single_payment_source.sql',import.meta.url),'utf8')
const projectBillingUi=fs.readFileSync(new URL('../../web/src/PartialInvoiceFromQuote.jsx',import.meta.url),'utf8')

function simulateProjectFlow({projectTotal,priorPayment,dteTotal,finalPayment}){
  const appliedAdvance=Math.min(priorPayment,dteTotal)
  const receivableAfterDte=Math.max(0,dteTotal-appliedAdvance)
  const receivableAfterFinalPayment=Math.max(0,receivableAfterDte-finalPayment)
  // El anticipo ya entró a Caja cuando se recibió. Aplicarlo al DTE no mueve efectivo.
  const cashMovements=[priorPayment]
  if(finalPayment>0)cashMovements.push(finalPayment)
  return {
    projectTotal,
    dteTotal,
    appliedAdvance,
    receivableAfterDte,
    receivableAfterFinalPayment,
    cashTotal:cashMovements.reduce((sum,value)=>sum+value,0),
    cashMovementCount:cashMovements.length,
  }
}

test('flujo integral $80: anticipo $40 + CCF $80 + cobro final $40 = CxC $0 y Caja $80',()=>{
  const result=simulateProjectFlow({projectTotal:80,priorPayment:40,dteTotal:80,finalPayment:40})
  assert.deepEqual(result,{
    projectTotal:80,
    dteTotal:80,
    appliedAdvance:40,
    receivableAfterDte:40,
    receivableAfterFinalPayment:0,
    cashTotal:80,
    cashMovementCount:2,
  })
})

test('pago previo ligado a cotización/OT crea anticipo trazable sin duplicar Caja',()=>{
  assert.match(workPaymentSql,/source_internal_income_id uuid references public\.internal_income_records/i)
  assert.match(workPaymentSql,/customer_advances_internal_income_uidx/i)
  assert.match(workPaymentSql,/if new\.source_internal_income_id is not null then\s*return new;/i)
  assert.match(workPaymentSql,/'INCOME','INTERNAL_INCOME',r\.id/i)
  assert.match(workPaymentSql,/r\.quote_id is not null or r\.work_order_id is not null/i)
})

test('DTE aceptado aplica el anticipo a la CxC como pago, pero ese pago no vuelve a Caja',()=>{
  assert.match(advanceSql,/insert into public\.customer_advance_applications/i)
  assert.match(advanceSql,/insert into public\.customer_payments[\s\S]*source_advance_id/i)
  assert.match(advanceSql,/if new\.source_advance_id is not null then return new;/i)
})

test('el CCF de proyecto queda a crédito cuando hay saldo después del anticipo',()=>{
  assert.match(projectBillingUi,/condicionOperacion:advanceToApply<requested\?2:1/)
  assert.match(projectBillingUi,/periodo:advanceToApply<requested\?30:null/)
  assert.match(projectBillingUi,/sourceQuoteId:quote\.id,sourceWorkOrderId:workOrder\?\.id\|\|null/)
  assert.match(projectBillingUi,/Saldo que quedará por cobrar:/i)
})

test('el cobro final de la CxC mueve Caja una sola vez y bloquea sobrepago',()=>{
  assert.match(paymentSql,/cash_movements_customer_payment_uidx/i)
  assert.match(paymentSql,/on conflict \(company_id,source_type,source_id\)[\s\S]*do nothing/i)
  assert.match(paymentSql,/p_amount>v_balance\+0\.001/i)
})

test('la CxC termina pagada al sumar anticipo aplicado y cobro final',()=>{
  assert.match(balanceSql,/sum\(cp\.amount\)/i)
  assert.match(balanceSql,/when coalesce\(v_paid,0\)>=v_total then 'PAID'/i)
  assert.match(balanceSql,/amount_paid=least\(coalesce\(v_paid,0\),amount_total\)/i)
})
