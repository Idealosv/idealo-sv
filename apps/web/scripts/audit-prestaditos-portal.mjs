import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRESTADITOS_FREE_QA_CASES, summarizeFreeQaCase } from '../src/prestaditos-free-qa-fixtures.js'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const portal=read('../src/PrestaditosPortalApp.jsx')
const inbox=read('../src/PrestaditosPortalInbox.jsx')
const entry=read('../src/main.jsx')
const base=read('../../../supabase/migrations/20261009170000_prestaditos_portal_access.sql')
const rpc=read('../../../supabase/migrations/20261009170100_prestaditos_portal_rpc.sql')
const snapshot=read('../../../supabase/migrations/20261009170200_prestaditos_portal_dashboard.sql')
const receipts=read('../../../supabase/migrations/20261009170300_prestaditos_portal_receipts.sql')
const checks=[
 ['App tiene formulario de inversión y retiro',portal.includes("inv_portal_submit_application")&&portal.includes("inv_portal_submit_withdrawal")],
 ['App muestra demo local sin dinero real',portal.includes('SOLICITUD SIMULADA')&&portal.includes("params.get('demo')==='1'")],
 ['Ruta independiente del ERP',entry.includes("window.location.pathname === '/prestaditos/app'")],
 ['ERP revisa identidad antes de vincular',inbox.includes("inv_portal_link_account")&&inbox.includes('¿Verificaste identidad y DUI?')],
 ['Solicitudes de inversión usan la tabla inv_applications',rpc.includes('insert into public.inv_applications')],
 ['Retiros NO asientan pagos automáticamente',rpc.includes('insert into public.inv_portal_withdrawals')&&!rpc.includes('insert into public.inv_payments')],
 ['Retiros completados requieren pago real registrado',rpc.includes("p.status='POSTED'")&&rpc.includes('p.payment_type=r.payment_type')&&rpc.includes('p.amount=r.amount')],
 ['Datos de la app salen del libro ERP existente',snapshot.includes('public.inv_investments')&&snapshot.includes('public.inv_payments')&&snapshot.includes('public.inv_applications')],
 ['Comprobantes privados vinculados a la solicitud del ERP',portal.includes('inv_portal_attach_receipt')&&receipts.includes('portal_receipt_path')&&receipts.includes('false,5242880')],
 ['Acceso al comprobante solo con cuenta o administrador verificado',receipts.includes('inv_portal_receipt_read')&&receipts.includes('inv_portal_links')],
 ['No hay una segunda contabilidad',![base,rpc,snapshot].some(x=>x.includes('prestaditos_ledger'))],
 ['Acceso ligado a un usuario autenticado',snapshot.includes('auth.uid()')&&base.includes('enable row level security')],
 ['No se habilita acceso financiero sin expediente aprobado',rpc.includes("e.status='APPROVED'")&&rpc.includes("i.status='ACTIVE'")],
]
for(const [name,ok] of checks){assert.ok(ok, 'FALLÓ: '+name);console.log('OK · '+name)}
const rates=[10,12,15]
for(const [idx,qa] of PRESTADITOS_FREE_QA_CASES.entries()){
 const sum=summarizeFreeQaCase(qa)
 assert.equal(qa.investment.agreed_return_rate,rates[idx])
 assert.equal(sum.annualGain,qa.expected.annual_gain)
 assert.equal(sum.yieldPaid,qa.expected.yield_paid)
 assert.equal(sum.capitalReturned,qa.expected.capital_returned)
 assert.equal(sum.endingCapital,qa.expected.ending_capital)
 console.log('OK · '+qa.key+' · '+qa.investment.principal+' al '+rates[idx]+'% · saldo final '+sum.endingCapital)
}
console.log('Prestaditos portal: '+checks.length+' controles estáticos y '+PRESTADITOS_FREE_QA_CASES.length+' escenarios ficticios OK')
