import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(resolve(here, '../src/FacturacionDte.jsx'), 'utf8')
const failures = []

if (!source.includes('result.iva=roundMoney(result.gravada*TAX_RATE)')) failures.push('Facturación debe calcular IVA 13% sobre la base gravada')
if (!source.includes('result.operacion=roundMoney(result.subtotal+result.iva)')) failures.push('El total debe sumar el IVA al subtotal')
if (!source.includes("function toFiscalItems(items,dteType)")) failures.push('Falta conversión fiscal para DTE-01')
if (!source.includes("if(dteType!=='01') return items")) failures.push('Crédito Fiscal no debe transformarse como DTE-01')
if (!source.includes('items:fiscalItems')) failures.push('El envío debe usar las partidas convertidas al formato fiscal')
if (!source.includes('Precio sin IVA *')) failures.push('La captura debe indicar que el precio se ingresa sin IVA')
if (!source.includes('<span>IVA 13%</span><strong>+ ${totals.iva.toFixed(2)}</strong>')) failures.push('El resumen debe mostrar el IVA como suma explícita')

if (failures.length) {
  console.error('\nAuditoría de IVA falló:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Auditoría IVA OK: base gravada + IVA 13% y conversión DTE-01 protegidas.')
