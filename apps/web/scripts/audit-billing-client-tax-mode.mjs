import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const billing=await readFile(resolve(src,'FacturacionDte.jsx'),'utf8')
const main=await readFile(resolve(src,'main.jsx'),'utf8')
const failures=[]

if(!billing.includes("const [priceMode,setPriceMode]=useState('sin_iva')")) failures.push('Falta selector de modalidad de precio con/sin IVA')
if(!billing.includes('Precio con IVA incluido')||!billing.includes('Precio sin IVA')) failures.push('Faltan ambas opciones visibles de IVA')
if(!billing.includes("dteType==='03'?'Seleccionar cliente contribuyente':'Consumidor final / seleccionar cliente'")) failures.push('Crédito Fiscal no cambia el placeholder a cliente contribuyente')
if(billing.includes("if(value==='03'&&!selectedClient)")) failures.push('Crédito Fiscal vuelve a exigir cliente antes de poder seleccionarlo')
if(!billing.includes("dteType==='03'?'Cliente contribuyente pendiente':'Consumidor final'")) failures.push('El resumen puede volver a mostrar Consumidor final en Crédito Fiscal')
if(!billing.includes('needsTaxIncluded')||!billing.includes('enteredTaxIncluded')) failures.push('Falta conversión fiscal entre precios con/sin IVA')
if(!billing.includes("priceMode==='con_iva'")) failures.push('Falta cálculo para precios con IVA incluido')
if(!main.includes("import './billing-tax-mode.css'")) failures.push('Falta cargar estilos del selector IVA')

if(failures.length){console.error('Auditoría cliente/IVA falló:');failures.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log('Auditoría cliente/IVA OK: CCF separado y precios con/sin IVA protegidos.')
