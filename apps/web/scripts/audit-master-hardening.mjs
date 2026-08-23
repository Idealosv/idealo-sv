import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../../..')
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8')
const requireText=(text,token,label)=>{if(!text.includes(token))throw new Error(`${label}: falta ${token}`)}
const forbidText=(text,token,label)=>{if(text.includes(token))throw new Error(`${label}: no debe contener ${token}`)}

const security=read('apps/web/src/SecurityLauncher.jsx')
requireText(security,"select('company_id,user_id,role,created_at')",'Seguridad ↔ company_members')
forbidText(security,"select('id,user_id,role,active,created_at')",'Seguridad ↔ company_members')
forbidText(security,"from '@supabase/supabase-js'",'Seguridad singleton')

const receivables=read('apps/web/src/BillingReceivablesPanel.jsx')
forbidText(receivables,'source_type','CxC ↔ accounts_receivable')
forbidText(receivables,'source_id','CxC ↔ accounts_receivable')
requireText(receivables,'dte_document_id','CxC ↔ accounts_receivable')
requireText(receivables,'concept','CxC ↔ accounts_receivable')

const api=read('apps/api/src/index.js')
requireText(api,"process.env.NODE_ENV === 'production'",'CORS producción')
requireText(api,'CORS_ORIGIN es obligatoria en producción','CORS producción')

const sw=read('apps/web/public/sw.js')
requireText(sw,"url.origin!==self.location.origin",'PWA same-origin')
requireText(sw,"request.mode==='navigate'",'PWA navegación')
forbidText(sw,"c.put(e.request",'PWA caché indiscriminada')

for(const relative of [
  'apps/web/src/App.jsx',
  'apps/web/src/FacturacionLauncher.jsx',
  'apps/web/src/CommercialLauncher.jsx',
  'apps/web/src/OperationsFinanceLauncher.jsx',
  'apps/web/src/InventoryCostLauncher.jsx',
  'apps/web/src/FinancialDashboardLauncher.jsx',
  'apps/web/src/HrPayrollLauncher.jsx',
  'apps/web/src/ProductionCalendarLauncher.jsx',
  'apps/web/src/SecurityLauncher.jsx',
]){
  const source=read(relative)
  requireText(source,"from './lib/supabase.js'",`${relative} singleton Supabase`)
  forbidText(source,"from '@supabase/supabase-js'",`${relative} cliente duplicado`)
}

const hardening=read('supabase/migrations/20260823203000_master_security_performance_hardening.sql')
requireText(hardening,'security_invoker = true','Vista financiera')
requireText(hardening,'clients_delete_admins','RLS Clientes')
requireText(hardening,'revoke execute on function public.handle_new_user()','Funciones internas')

const permissions=read('supabase/migrations/20260823204500_restore_authenticated_table_access.sql')
for(const table of ['work_orders','finished_products','accounts_receivable','customer_payments','deliveries','production_schedule_events','quality_incidents','work_order_evidence']){
  requireText(permissions,`public.${table}`,`Permiso ${table}`)
}

console.log('OK auditoría maestra: esquema, permisos, CORS, PWA y singleton Supabase')
