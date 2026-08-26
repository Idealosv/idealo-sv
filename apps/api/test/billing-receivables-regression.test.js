import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, isCancelled, isOpen, isPaid, localIsoDate, matchesReceivableFilter, statusLabel } from '../../web/src/billingReceivables.js'

test('una cuenta anulada nunca se clasifica como pagada',()=>{
  const row={status:'CANCELLED',amount_total:100,amount_paid:0,due_date:'2026-08-20'}
  assert.equal(isCancelled(row),true)
  assert.equal(isPaid(row),false)
  assert.equal(isOpen(row),false)
  assert.equal(statusLabel(row,'2026-08-26'),'Anulada')
  assert.equal(matchesReceivableFilter(row,'PAID','2026-08-26'),false)
  assert.equal(matchesReceivableFilter(row,'CANCELLED','2026-08-26'),true)
})

test('VOID también queda separado de pagadas y pendientes',()=>{
  const row={status:'VOID',amount_total:50,amount_paid:0}
  assert.equal(statusLabel(row,'2026-08-26'),'Anulada')
  assert.equal(matchesReceivableFilter(row,'OPEN','2026-08-26'),false)
  assert.equal(matchesReceivableFilter(row,'PAID','2026-08-26'),false)
})

test('saldo cero se considera pagado salvo que esté anulado',()=>{
  assert.equal(isPaid({status:'OPEN',amount_total:100,amount_paid:100}),true)
  assert.equal(statusLabel({status:'OPEN',amount_total:100,amount_paid:100},'2026-08-26'),'Pagada')
})

test('vencimientos usan fecha local y límites exactos de siete días',()=>{
  const today='2026-08-26'
  assert.equal(statusLabel({status:'OPEN',amount_total:100,amount_paid:0,due_date:'2026-08-25'},today),'Vencida')
  assert.equal(statusLabel({status:'OPEN',amount_total:100,amount_paid:0,due_date:'2026-09-02'},today),'Por vencer')
  assert.equal(statusLabel({status:'OPEN',amount_total:100,amount_paid:0,due_date:'2026-09-03'},today),'Pendiente')
  assert.equal(addDays(today,7),'2026-09-02')
})

test('localIsoDate no depende de UTC para construir el día contable',()=>{
  const localNoon=new Date(2026,7,26,23,30,0)
  assert.equal(localIsoDate(localNoon),'2026-08-26')
})
