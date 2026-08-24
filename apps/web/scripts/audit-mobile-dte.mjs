import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8')
const requireText=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbidText=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}

const mobile=read('apps/web/src/MobileDteHost.jsx')
for(const token of [
  "from './lib/supabase.js'",
  "'/api/dte/invoices'",
  "'/api/dte/sign-test'",
  "'/api/dte/transmit-test'",
  "dte_documents",
  "DTE-01",
  "DTE-03",
  "PDF / imprimir",
  "Compartir",
  "selloRecibido",
])requireText(mobile,token,'DTE móvil')
forbidText(mobile,"from '@supabase/supabase-js'",'DTE móvil singleton Supabase')
forbidText(mobile,'setInterval(','DTE móvil sin polling continuo')

const main=read('apps/web/src/main.jsx')
requireText(main,"import MobileDteHost from './MobileDteHost.jsx'",'Montaje DTE móvil')
requireText(main,'<MobileDteHost/>','Montaje DTE móvil')
requireText(main,"import './mobile-dte.css'",'Estilos DTE móvil')

const invoice=read('apps/api/src/dte/invoice-service.js')
requireText(invoice,"['01', '03'].includes(type)",'Backend DTE-01/DTE-03')
requireText(invoice,'company_members','Permiso backend DTE')
requireText(invoice,'Bearer ','Autenticación backend DTE')

console.log('OK auditoría DTE móvil: crear, firmar, transmitir, estado MH, PDF y compartir')
