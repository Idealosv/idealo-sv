import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8')
const requireText=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbidText=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}

for(const relative of [
  'apps/web/src/CommercialAutomationCenter.jsx',
  'apps/web/src/Client360Enhancer.jsx',
  'apps/web/src/Client360TimelineHost.jsx',
  'apps/web/src/ClientCrmPipeline.jsx',
  'apps/web/src/MobileClient360.jsx',
  'apps/web/src/MobileFieldTools.jsx',
  'apps/web/src/MobileSalesFieldBlock.jsx',
]){
  const source=read(relative)
  requireText(source,"from './lib/supabase.js'",`${relative} singleton Supabase`)
  forbidText(source,"from '@supabase/supabase-js'",`${relative} cliente Supabase duplicado`)
  forbidText(source,'setInterval(',`${relative} polling continuo`)
}

const automation=read('supabase/migrations/20260824124000_fix_client_commercial_task_null_clients.sql')
requireText(automation,'client_id is not null','Automatización comercial sin cliente')

const qaCommercial=read('supabase/migrations/20260824125500_remove_legacy_qa_commercial_fixtures.sql')
for(const token of ['QA trabajo 1','QA trabajo 2','QA trabajo 3','987654'])requireText(qaCommercial,token,'Limpieza QA comercial')

const qaReceivable=read('supabase/migrations/20260824131000_remove_legacy_qa_receivable_fixture.sql')
requireText(qaReceivable,'QA saldo','Limpieza QA CxC')
requireText(qaReceivable,'987650','Limpieza QA CxC')

const sw=read('apps/web/public/sw.js')
requireText(sw,"CACHE='idealo-mobile-v4'",'Versión PWA')
requireText(sw,"url.origin!==self.location.origin",'PWA same-origin')

const main=read('apps/web/src/main.jsx')
requireText(main,"navigator.serviceWorker.addEventListener('controllerchange'",'Actualización PWA')
requireText(main,'window.location.reload()','Recarga de bundle actualizado')

console.log('OK auditoría funcional runtime: Clientes/CRM, móvil, PWA y fixtures QA protegidos')
