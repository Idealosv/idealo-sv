import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areaM2, tierPrice, calculateItem, calculateQuote, canTransition,
  validateQuote, quoteCode, weightedForecast, quoteStats
} from '../../web/src/quoteEngine.js'

test('areaM2 converts cm and mm correctly', () => {
  assert.equal(areaM2({width:100,height:200,dimension_unit:'cm'}),2)
  assert.equal(areaM2({width:1000,height:2000,dimension_unit:'mm'}),2)
  assert.equal(areaM2({width:1.5,height:2,dimension_unit:'m'}),3)
})

test('tierPrice selects the matching quantity scale', () => {
  const tiers=[
    {min_quantity:1,max_quantity:9,unit_price:10,active:true},
    {min_quantity:10,max_quantity:49,unit_price:8,active:true},
    {min_quantity:50,max_quantity:null,unit_price:6,active:true}
  ]
  assert.equal(tierPrice(tiers,1,12),10)
  assert.equal(tierPrice(tiers,20,12),8)
  assert.equal(tierPrice(tiers,100,12),6)
  assert.equal(tierPrice([],100,12),12)
})

test('calculateItem handles discounts, surcharge, tax, cost and margin', () => {
  const result=calculateItem({quantity:10,unit_price:10,discount_percent:10,discount_fixed:5,surcharge_percent:10,taxable:true,tax_rate:13,unit_cost:4,labor_unit_cost:1,installation_unit_cost:0})
  assert.equal(result.gross,100)
  assert.equal(result.discount,15)
  assert.equal(result.surcharge,8.5)
  assert.equal(result.subtotal,93.5)
  assert.equal(result.tax,12.16)
  assert.equal(result.total,105.66)
  assert.equal(result.totalCost,50)
  assert.equal(result.profit,43.5)
  assert.equal(result.margin,46.52)
})

test('calculateItem supports square meter pricing', () => {
  const result=calculateItem({quantity:2,width:1,height:2,dimension_unit:'m',price_per_m2:15,taxable:false,unit_cost:5})
  assert.equal(result.area,2)
  assert.equal(result.unitPrice,30)
  assert.equal(result.gross,60)
  assert.equal(result.total,60)
})

test('calculateQuote aggregates items and global discount', () => {
  const result=calculateQuote([
    {quantity:2,unit_price:20,taxable:true,tax_rate:13,unit_cost:10},
    {quantity:1,unit_price:60,taxable:true,tax_rate:13,unit_cost:20}
  ],{discount_percent:10})
  assert.equal(result.gross,100)
  assert.equal(result.globalDiscount,10)
  assert.equal(result.subtotal,90)
  assert.equal(result.tax,11.7)
  assert.equal(result.total,101.7)
  assert.equal(result.cost,40)
  assert.equal(result.profit,50)
})

test('workflow only allows declared quote transitions', () => {
  assert.equal(canTransition('DRAFT','SENT'),true)
  assert.equal(canTransition('SENT','APPROVED'),true)
  assert.equal(canTransition('APPROVED','CONVERTED'),true)
  assert.equal(canTransition('DRAFT','CONVERTED'),false)
  assert.equal(canTransition('REJECTED','APPROVED'),false)
})

test('validation blocks incomplete quotes and warns about low margin', () => {
  const invalid=validateQuote({client_id:'',items:[{description:'',quantity:0,unit_price:10}]})
  assert.equal(invalid.valid,false)
  assert.ok(invalid.errors.length>=3)

  const items=[{description:'Trabajo',quantity:1,unit_price:100,unit_cost:90,taxable:false}]
  const totals=calculateQuote(items)
  const low=validateQuote({client_id:'client',items,minimum_margin:20},totals)
  assert.equal(low.valid,true)
  assert.ok(low.warnings.some(x=>x.includes('margen')||x.includes('Margen')))
})

test('quoteCode creates annual business code', () => {
  assert.equal(quoteCode(25,'COT','2026-08-22T12:00:00Z'),'COT-2026-00025')
})

test('forecast and stats weight pipeline by status', () => {
  const quotes=[
    {status:'DRAFT',total:100},
    {status:'NEGOTIATION',total:100},
    {status:'APPROVED',total:100},
    {status:'REJECTED',total:100}
  ]
  assert.equal(weightedForecast(quotes),155)
  const stats=quoteStats(quotes)
  assert.equal(stats.count,4)
  assert.equal(stats.value,400)
  assert.equal(stats.approvedValue,100)
  assert.equal(stats.approvalRate,25)
  assert.equal(stats.rejectionRate,25)
})
