import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const need=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbid=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}
const center=read('apps/web/src/ClientIntegrityCenter.jsx')
const readiness=read('apps/web/src/clientDteReadiness.js')
for(const token of ["from './lib/supabase.js'","from './clientDteReadiness.js'",'getClientDteReadiness','district_code','client_credit_profiles','accounts_receivable','client_interactions','preferred_dte_type','blocked_for_debt'])need(center,token,'Integridad clientes')
for(const token of ['CCF_DTE03_REQUIRED','CONSUMER_DTE01_REQUIRED','tax_id','nrc','activity_code','business_activity','department_code','municipality_code','district_code','address','phone','email'])need(readiness,token,'Contrato central DTE clientes')
forbid(center,"from '@supabase/supabase-js'",'Singleton Supabase clientes')
forbid(center,'setInterval(','Sin polling continuo')
const main=read('apps/web/src/main.jsx')
const deferred=read('apps/web/src/DeferredRuntimeHosts.jsx')
need(main,"lazy(()=>import('./DeferredRuntimeHosts.jsx'))",'Runtime diferido conectado')
need(deferred,"import ClientIntegrityCenter from './ClientIntegrityCenter.jsx'",'Montaje integridad clientes')
need(deferred,'<ClientIntegrityCenter/>','Montaje integridad clientes')
need(main,"import './client-integrity-center.css'",'Estilos integridad clientes')
const billing=read('apps/web/src/FacturacionDte.jsx')
for(const token of ['tax_id','nrc','activity_code','business_activity','department_code','municipality_code','district_code','address','phone','email'])need(billing,token,'Contrato fiscal DTE-03')
console.log('OK auditoría Clientes: runtime diferido, validador DTE central, duplicados, crédito, CxC y seguimientos protegidos')
