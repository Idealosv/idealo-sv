import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const [launcher,receivables,main]=await Promise.all([
  readFile(resolve(src,'FacturacionLauncher.jsx'),'utf8'),
  readFile(resolve(src,'BillingReceivablesPanel.jsx'),'utf8'),
  readFile(resolve(src,'main.jsx'),'utf8'),
])
const failures=[]
const need=(source,text,message)=>{if(!source.includes(text))failures.push(message)}
for(const section of ["id: 'resumen'","id: 'emitir'","id: 'documentos'","id: 'cobros'","id: 'hacienda'"])need(launcher,section,`Falta sección de Facturación ${section}`)
need(launcher,"group: 'Operación diaria'",'Facturación debe separar operación diaria')
need(launcher,"group: 'Cobranza'",'Facturación debe separar cobranza')
need(launcher,"group: 'Administración fiscal'",'Facturación debe separar Hacienda técnico')
need(launcher,"import BillingReceivablesPanel from './BillingReceivablesPanel.jsx'",'Facturación debe integrar Cuentas por cobrar')
need(launcher,'<BillingReceivablesPanel','Facturación debe renderizar Cuentas por cobrar')
for(const table of ['accounts_receivable','customer_payments'])need(receivables,`.from('${table}')`,`CxC debe consultar ${table}`)
need(receivables,".eq('company_id',company.id)",'CxC debe aislar datos por company_id')
need(receivables,'Vencido','CxC debe mostrar vencidos')
need(receivables,'Vence en 7 días','CxC debe mostrar vencimientos próximos')
need(main,"import './billing-reorganization.css'",'main debe cargar estilos de reorganización de Facturación')
if(failures.length){console.error('\nAuditoría de reorganización de Facturación falló:');failures.forEach(item=>console.error(`- ${item}`));process.exit(1)}
console.log('Auditoría Facturación OK: operación, documentos, cobranza y Hacienda están separados y CxC conserva aislamiento por empresa.')
