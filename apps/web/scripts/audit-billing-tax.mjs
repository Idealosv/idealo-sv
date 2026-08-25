import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(resolve(here, '../src/FacturacionDte.jsx'), 'utf8')
const compact = source.replace(/\s+/g, '')
const failures = []

if (!source.includes("priceMode==='con_iva'")) failures.push('Facturación debe soportar precios con IVA incluido')
if (!compact.includes('iva=roundMoney(base*TAX_RATE)')) failures.push('El modo sin IVA debe calcular 13% sobre la base gravada')
if (!compact.includes('base=roundMoney(net/(1+TAX_RATE))')) failures.push('El modo con IVA debe separar la base del precio final')
if (!compact.includes('result.operacion=roundMoney(result.subtotal+result.iva)')) failures.push('El resumen debe recomponer subtotal más IVA')
if (!compact.includes('functiontoFiscalItems(items,dteType,priceMode)')) failures.push('Falta conversión fiscal según DTE y modalidad de precio')
if (!compact.includes("needsTaxIncluded=dteType==='01'")) failures.push('DTE-01 debe conservar precio fiscal con IVA incluido')
if (!compact.includes("enteredTaxIncluded=priceMode==='con_iva'")) failures.push('La conversión fiscal debe considerar cómo se ingresó el precio')
if (!compact.includes('items:fiscalItems')) failures.push('El envío debe usar las partidas convertidas al formato fiscal')
if (!source.includes('Precio con IVA incluido') || !source.includes('Precio sin IVA')) failures.push('La captura debe ofrecer ambos modos de precio')
if (!source.includes('<span>IVA 13%</span><strong>+ ${totals.iva.toFixed(2)}</strong>')) failures.push('El resumen debe mostrar el IVA como suma explícita')

if (failures.length) {
  console.error('\nAuditoría de IVA falló:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Auditoría IVA OK: precios con/sin IVA y conversión fiscal DTE protegidos.')
