import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeQuoteItemsToTotal } from '../../web/src/quoteInvoiceNormalizer.js'

const total=(rows,mode)=>Number(rows.reduce((sum,item)=>{
  const net=Number(item.cantidad)*Number(item.precioUni)-Number(item.montoDescu||0)
  return sum+(item.tipoVenta==='gravada'&&mode==='sin_iva'?net*1.13:net)
},0).toFixed(2))

test('normaliza 70.79 a cotización de 80.00 sin cambiar el total objetivo',()=>{
  const rows=[{cantidad:'1',precioUni:'39.82',montoDescu:'0',tipoVenta:'gravada'},{cantidad:'1',precioUni:'30.97',montoDescu:'0',tipoVenta:'gravada'}]
  const fixed=normalizeQuoteItemsToTotal(rows,'con_iva',80)
  assert.equal(total(fixed,'con_iva'),80)
})
