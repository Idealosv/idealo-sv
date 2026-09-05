import { calculateQuote, itemForTaxMode } from '../src/quoteEngine.js'
import { quotePdfLineValues } from '../src/quotePdf.js'

const close=(actual,expected,label)=>{if(Math.abs(Number(actual)-Number(expected))>0.01)throw new Error(`${label}: esperado ${expected}, recibido ${actual}`)}

const includedInput={description:'Lona traslucida',quantity:2,width:3.2,height:1.2,dimension_unit:'m',price_per_m2:16.95,unit_price:0,discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0,taxable:true,tax_rate:13,unit_cost:0,labor_unit_cost:0,installation_unit_cost:0}
const includedEffective=itemForTaxMode(includedInput,'INCLUDED')
const includedLine=quotePdfLineValues(includedEffective)
const includedTotals=calculateQuote([includedEffective],{discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0})
close(includedLine.area,3.84,'Área m2')
close(includedLine.customerRatePerM2,16.95,'Precio por m2 con IVA')
close(includedLine.customerUnit,65.09,'Precio unitario por pieza con IVA')
close(includedLine.customerLineTotal,130.18,'Total de línea con IVA')
close(includedTotals.subtotal,115.2,'Subtotal interno')
close(includedTotals.tax,14.98,'IVA interno')
close(includedTotals.total,130.18,'Total interno')
close(includedLine.customerLineTotal,includedTotals.total,'PDF vs total ERP')

const addedInput={...includedInput,quantity:1,price_per_m2:15}
const addedEffective=itemForTaxMode(addedInput,'ADDED')
const addedLine=quotePdfLineValues(addedEffective)
const addedTotals=calculateQuote([addedEffective],{})
close(addedLine.area,3.84,'Área ADDED')
close(addedLine.customerRatePerM2,16.95,'Precio m2 final ADDED')
close(addedLine.customerUnit,65.09,'Precio unitario final ADDED')
close(addedLine.customerLineTotal,65.09,'Total línea ADDED')
close(addedTotals.subtotal,57.6,'Subtotal ADDED')
close(addedTotals.tax,7.49,'IVA ADDED')
close(addedTotals.total,65.09,'Total ADDED')

const unitItem={description:'Servicio unitario',quantity:3,unit_price:10,price_per_m2:0,taxable:true,tax_rate:13,discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0,unit_cost:0,labor_unit_cost:0,installation_unit_cost:0}
const unitLine=quotePdfLineValues(unitItem)
close(unitLine.customerUnit,11.3,'Precio unitario normal con IVA')
close(unitLine.customerLineTotal,33.9,'Total normal con IVA')

console.log('OK: PDF de cotización alineado con cálculo ERP, IVA y precios por m2.')
