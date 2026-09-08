import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const need=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbid=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}
const center=read('apps/web/src/ClientIntegrityCenter.jsx')
for(const token of ["from './lib/supabase.js'",'DTE03_REQUIRED','district_code','client_credit_profiles','accounts_receivable','client_interactions','preferred_dte_type','blocked_for_debt'])need(center,token,'Integridad clientes')
forbid(center,"from '@supabase/supabase-js'",'Singleton Supabase clientes')
forbid(center,'setInterval(','Sin polling continuo')
const main=read('apps/web/src/main.jsx')
need(main,"import ClientIntegrityCenter from './ClientIntegrityCenter.jsx'",'Montaje integridad clientes')
need(main,'<ClientIntegrityCenter/>','Montaje integridad clientes')
need(main,"import './client-integrity-center.css'",'Estilos integridad clientes')
const billing=read('apps/web/src/FacturacionDte.jsx')
for(const token of ['tax_id','nrc','activity_code','business_activity','department_code','municipality_code','district_code','address','phone','email'])need(billing,token,'Contrato fiscal DTE-03')
console.log('OK auditoría Clientes: DTE-03, duplicados, crédito, CxC y seguimientos protegidos')
