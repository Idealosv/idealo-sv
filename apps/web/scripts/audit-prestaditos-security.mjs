import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const webRoot=path.resolve(here,'..')
const repoRoot=path.resolve(webRoot,'../..')
const read=rel=>fs.readFileSync(path.join(repoRoot,rel),'utf8')
const checks=[]

function expect(name,condition,detail=''){
 if(!condition)throw new Error('FAIL Prestadito$ seguridad: '+name+(detail?' · '+detail:''))
 checks.push(name)
}

const base=read('supabase/migrations/20260921154000_prestaditos_investor_vertical.sql')
const payments=read('supabase/migrations/20260921184500_prestaditos_payment_ledger.sql')
const contracts=read('supabase/migrations/20260921212000_prestaditos_rates_contracts_renewals.sql')
const annual=read('supabase/migrations/20260921214500_prestaditos_annual_rate_basis.sql')
const settings=read('supabase/migrations/20260921205000_prestaditos_company_settings.sql')
const notifications=read('supabase/migrations/20260921222000_prestaditos_notifications_monthly_closeout.sql')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const integrity=read('apps/web/src/prestaditos-integrity.js')
const smoke=read('supabase/tests/prestaditos_staging_readiness.sql')

expect('RLS base inversionistas',/alter table public\.inv_investors enable row level security/i.test(base))
expect('RLS inversiones',/alter table public\.inv_investments enable row level security/i.test(base))
expect('RLS pagos',/alter table public\.inv_payments enable row level security/i.test(base))
expect('bucket privado',/insert into storage\.buckets[\s\S]*investor-documents[\s\S]*false/i.test(base))
expect('pagos sin escritura directa autenticada',/revoke insert,update,delete on public\.inv_payments from authenticated/i.test(payments))
expect('contratos sin escritura directa autenticada',/revoke insert,update,delete on public\.inv_contracts from authenticated/i.test(contracts))
expect('tasas anuales forzadas',/return_rate_basis:='ANNUAL'/i.test(annual))
expect('tasas permitidas 10 12 15',/p_rate in \(10,12,15\)/i.test(contracts))
expect('configuración owner admin',/inv_company_can_review/i.test(settings))
expect('notificaciones aisladas por usuario',/user_id=auth\.uid\(\)/i.test(notifications))
expect('cierres mensuales no editables directos',/revoke insert,update,delete on public\.inv_monthly_closeouts from authenticated/i.test(notifications))
expect('pagos revertidos fuera del dashboard',/payment_type==='YIELD'&&\(x\.status\|\|'POSTED'\)==='POSTED'/.test(host))
expect('auditoría de capital devuelto',/CAPITAL_OVER_RETURNED/.test(integrity))
expect('auditoría de contrato firmado sin documento',/SIGNED_WITHOUT_DOCUMENT/.test(integrity))
expect('auditoría de renovación sin sucesora',/EXECUTED_WITHOUT_SUCCESSOR/.test(integrity))
expect('smoke test no productivo disponible',/PRESTADITOS_SMOKE_OK/.test(smoke))

console.log('OK auditoría estática Prestadito$: '+checks.length+' controles PASS.')
console.log('NOTA: esta auditoría no sustituye RLS real contra una base aislada de staging.')
