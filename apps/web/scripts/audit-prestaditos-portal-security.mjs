import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const sql={
 access:read('../../../supabase/migrations/20261009170000_prestaditos_portal_access.sql'),
 rpc:read('../../../supabase/migrations/20261009170100_prestaditos_portal_rpc.sql'),
 snapshot:read('../../../supabase/migrations/20261009170200_prestaditos_portal_dashboard.sql'),
 receipts:read('../../../supabase/migrations/20261009170300_prestaditos_portal_receipts.sql')
}
const frontend=read('../src/PrestaditosPortalApp.jsx')
const inbox=read('../src/PrestaditosPortalInbox.jsx')
const check=(name,rule)=>{assert.ok(rule,'SEGURIDAD FALLÓ: '+name);console.log('OK · '+name)}
const extract=(str,name)=>{
 const start=str.indexOf('create function public.'+name+'(')
 assert.ok(start>=0,'Falta RPC '+name)
 const end=str.indexOf('end $$;',start)
 assert.ok(end>start,'RPC incompleta '+name)
 return str.slice(start,end+7)
}
const link=extract(sql.rpc,'inv_portal_link_account')
const apply=extract(sql.rpc,'inv_portal_submit_application')
const withdraw=extract(sql.rpc,'inv_portal_submit_withdrawal')
const review=extract(sql.rpc,'inv_portal_review_withdrawal')
const dash=extract(sql.snapshot,'inv_portal_dashboard')
const receipt=extract(sql.receipts,'inv_portal_attach_receipt')

check('RLS activo en las tres tablas privadas',
 ['inv_portal_enrollments','inv_portal_links','inv_portal_withdrawals']
  .every(x=>sql.access.includes('alter table public.'+x+' enable row level security;')))
check('Ningún usuario anónimo accede directamente a tablas financieras',
 sql.access.includes('revoke all on public.inv_portal_enrollments,public.inv_portal_links,public.inv_portal_withdrawals from anon;'))
check('Usuarios autenticados solo pueden insertar sus propias inscripciones',
 sql.access.includes('grant insert on public.inv_portal_enrollments to authenticated;') &&
 !/grant\s+(insert|update|delete|all)\s+on\s+public\.inv_portal_withdrawals\s+to\s+authenticated/i.test(sql.access) &&
 !/grant\s+(insert|update|delete|all)\s+on\s+public\.inv_portal_links\s+to\s+authenticated/i.test(sql.access))
check('Aprobación requiere owner/admin verificado',
 link.includes('public.inv_company_can_review(e.company_id)')&&link.includes("e.status<>'PENDING'"))
check('Cuenta requiere identidad coincidente y correo ERP presente',
 link.includes("regexp_replace(i.dui")&&link.includes("length(regexp_replace(e.dui")&&
 link.includes("trim(coalesce(i.email,''))='' or lower(trim(i.email))<>lower(trim(e.email))"))
check('Aprobación requiere inversionista activo de la misma empresa',
 link.includes('company_id=e.company_id and status=\\'ACTIVE\\'')&&
 sql.access.includes('unique(company_id,investor_id)')&&sql.access.includes('unique(company_id,user_id)'))
check('Solicitud de aporte usa libro ERP original y cuenta aprobada',
 apply.includes("e.status='APPROVED'")&&apply.includes("i.status='ACTIVE'")&&
 apply.includes('insert into public.inv_applications')&&apply.includes("v.code='FINANCIAL_INVESTORS'"))
check('Solicitud de retiro solo en inversión y empresa verificadas',
 withdraw.includes('investor_id=v_investor')&&withdraw.includes("e.status='APPROVED'")&&
 withdraw.includes("v.code='FINANCIAL_INVESTORS'")&&withdraw.includes("status in ('ACTIVE','MATURING','MATURED')"))
check('Solicitud de retiro jamás genera un pago directo',
 withdraw.includes('insert into public.inv_portal_withdrawals')&&!withdraw.includes('insert into public.inv_payments'))
check('Solo admins pueden revisar retiros y las transiciones son controladas',
 review.includes('public.inv_company_can_review(r.company_id)')&&review.includes("r.status='PENDING'")&&
 review.includes("r.status='APPROVED'")&&review.includes("p_status='COMPLETED'"))
check('Retiro finalizado exige pago asentado de la misma empresa, persona, inversión, tipo y monto',
 ['p.id=p_payment','p.company_id=r.company_id','p.investor_id=r.investor_id',
 'p.investment_id=r.investment_id','p.payment_type=r.payment_type','p.amount=r.amount',"p.status='POSTED'"].every(x=>review.includes(x)) &&
 sql.access.includes('payment_id uuid unique references public.inv_payments(id)'))
check('Dashboard privado solo lee expedientes aprobados y activos',
 dash.includes('l.user_id=auth.uid()')&&dash.includes("e.status='APPROVED'")&&dash.includes("i.status='ACTIVE'")&&
 dash.includes('x.investor_id=i.id')&&dash.includes('a.investor_id=i.id')&&
 dash.includes('p.investor_id=i.id')&&dash.includes('w.investor_id=i.id'))
check('Dashboard comprueba acceso financiero de la empresa',
 dash.includes("v.code='FINANCIAL_INVESTORS'")&&dash.includes("s.status in ('active','trial')"))
check('Solo funcionarios autorizados pueden consultar comprobantes de otra cuenta',
 sql.receipts.includes('public.inv_company_can_review(c.id)')&&
 !sql.receipts.includes('inv_company_can_review(((storage.foldername(name))[1])::uuid)'))
check('Bucket de comprobantes privado y restringido en tamaño/tipo',
 sql.receipts.includes('false,5242880')&&
 sql.receipts.includes('on conflict(id) do update set public=false')&&
 sql.receipts.includes("array['image/jpeg','image/png','application/pdf']"))
check('Comprobante solo de solicitud pendiente, propia y de la misma empresa',
 sql.receipts.includes('a.created_by=auth.uid()')&&sql.receipts.includes("a.status='PENDING'")&&
 receipt.includes("a.portal_receipt_path is not null")&&receipt.includes("a.created_by<>auth.uid()"))
check('Datos de cuenta anterior se limpian al cambiar de sesión',
 frontend.includes('setProfile(null);setData(null);setLoading(Boolean(s));setSession(s)'))
check('Frontend usa RPC, no inserta ni modifica pagos ERP',
 frontend.includes("supabase.rpc(rpcName,args)") &&
 !frontend.includes("from('inv_payments').insert")&&!frontend.includes("from('inv_payments').update"))
check('Acciones de portal documentadas en auditoría ERP existente',
 ['PORTAL_ACCESS_APPROVED','PORTAL_ACCESS_REJECTED','PORTAL_APPLICATION_SUBMITTED','PORTAL_WITHDRAWAL_REQUESTED','PORTAL_WITHDRAWAL_']
 .every(x=>sql.rpc.includes(x)) && sql.receipts.includes('PORTAL_RECEIPT_ATTACHED'))
check('Bandeja ERP permite leer comprobantes por URL firmada, no pública',
 inbox.includes('createSignedUrl(path,60)')&&sql.receipts.includes('inv_portal_receipt_read'))
check('Todas las RPC sensibles revocan ejecución a usuario anónimo',
 sql.rpc.includes('from public,anon;')&&sql.snapshot.includes('from public,anon;')&&sql.receipts.includes('from public,anon;'))
check('Modelo financiero único sin segundo libro de movimientos',
 [sql.access,sql.rpc,sql.snapshot,sql.receipts].every(s=>!s.includes('create table public.prestaditos_ledger')))

console.log('AUDITORÍA ESTÁTICA COMPLETADA · No sustituye pruebas reales RLS con dos sesiones aisladas.')
