import { calculateQuote, itemForTaxMode } from '../src/quoteEngine.js'
import { createQuotePdfBlob, quotePdfLineValues } from '../src/quotePdf.js'

const close=(actual,expected,label)=>{if(Math.abs(Number(actual)-Number(expected))>0.01)throw new Error(`${label}: esperado ${expected}, recibido ${actual}`)}

const includedInput={description:'Lona traslucida',quantity:2,width:3.2,height:1.2,dimension_unit:'m',price_per_m2:16.95,unit_price:0,discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0,taxable:true,tax_rate:13,unit_cost:0,labor_unit_cost:0,installation_unit_cost:0}
const includedEffective=itemForTaxMode(includedInput,'INCLUDED')
const includedLine=quotePdfLineValues(includedEffective)
const includedTotals=calculateQuote([includedEffective],{discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0})
close(includedLine.area,3.84,'Área m2')
close(includedLine.customerRatePerM2,15,'Precio por m2 sin IVA')
close(includedLine.customerUnit,57.6,'Precio unitario por pieza sin IVA')
close(includedLine.customerLineTotal,115.2,'Subtotal de línea sin IVA')
close(includedTotals.subtotal,115.2,'Subtotal interno')
close(includedTotals.tax,14.98,'IVA interno')
close(includedTotals.total,130.18,'Total interno')
close(includedLine.customerLineTotal,includedTotals.subtotal,'PDF vs subtotal ERP sin IVA')

const addedInput={...includedInput,quantity:1,price_per_m2:15}
const addedEffective=itemForTaxMode(addedInput,'ADDED')
const addedLine=quotePdfLineValues(addedEffective)
const addedTotals=calculateQuote([addedEffective],{})
close(addedLine.area,3.84,'Área ADDED')
close(addedLine.customerRatePerM2,15,'Precio m2 sin IVA ADDED')
close(addedLine.customerUnit,57.6,'Precio unitario sin IVA ADDED')
close(addedLine.customerLineTotal,57.6,'Subtotal de línea ADDED')
close(addedTotals.subtotal,57.6,'Subtotal ADDED')
close(addedTotals.tax,7.49,'IVA ADDED')
close(addedTotals.total,65.09,'Total ADDED')

const unitItem={description:'Servicio unitario',quantity:3,unit_price:10,price_per_m2:0,taxable:true,tax_rate:13,discount_percent:0,discount_fixed:0,surcharge_percent:0,surcharge_fixed:0,unit_cost:0,labor_unit_cost:0,installation_unit_cost:0}
const unitLine=quotePdfLineValues(unitItem)
close(unitLine.customerUnit,10,'Precio unitario normal sin IVA')
close(unitLine.customerLineTotal,30,'Subtotal normal sin IVA')

const netQuoteItem={description:'Partida 1',quantity:1,unit_price:870,price_per_m2:0,taxable:true,tax_rate:13}
const netQuoteTotals=calculateQuote([netQuoteItem])
const netQuoteLine=quotePdfLineValues(netQuoteItem)
close(netQuoteLine.customerUnit,870,'Precio unitario mostrado sin IVA')
close(netQuoteLine.customerLineTotal,870,'Subtotal mostrado sin IVA')
close(netQuoteTotals.subtotal,870,'Subtotal de cotización')
close(netQuoteTotals.tax,113.10,'IVA de cotización')
close(netQuoteTotals.total,983.10,'Total de cotización')
const pdf=createQuotePdfBlob({company:{name:'IDEALO SV'},client:{name:'Cliente de prueba'},quote:{status:'DRAFT'},items:[netQuoteItem],totals:netQuoteTotals})
const pdfText=Buffer.from(await pdf.arrayBuffer()).toString('latin1')
for(const value of ['P. UNIT. S/IVA','$870.00','$113.10','$983.10']){
  if(!pdfText.includes(value))throw new Error('El PDF no contiene '+value)
}

console.log('OK: PDF cotización usa $870 sin IVA + $113.10 de IVA = $983.10, sin duplicar impuesto.')
