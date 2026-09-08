import {useEffect,useMemo,useState} from 'react'
import CashRegisterShift from './CashRegisterShift.jsx'
import InternalIncomeCard from './InternalIncomeCard.jsx'
import CashPaymentHistory from './CashPaymentHistory.jsx'
import {requestModule} from './erp-navigation.js'
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const methodLabel=value=>({CASH:'Efectivo',TRANSFER:'Transferencia',CARD:'Tarjeta',CHECK:'Cheque',OTHER:'Otro'}[value]||value||'Pago')
const pendingAmount=row=>Math.max(0,Number(row.amount_total||0)-Number(row.amount_paid||0))
export default function CashControlCenter({company,supabase,onOpenReports}){
 const [accounts,setAccounts]=useState([]),[recs,setRecs]=useState([]),[clients,setClients]=useState([]),[advances,setAdvances]=useState([]),[workQuotes,setWorkQuotes]=useState([]),[workPayments,setWorkPayments]=useState([]),[receivableRows,setReceivableRows]=useState([]),[showHistory,setShowHistory]=useState(false),[msg,setMsg]=useState('')
 const load=async()=>{const [a,r,c,ad,q,p,ar]=await Promise.all([
  supabase.from('cash_account_balances').select('cash_account_id,name,account_type,active,current_balance,income_today,expense_today').eq('company_id',company.id),
  supabase.from('cash_reconciliations').select('id,cash_account_id,status,difference,reconciliation_date').eq('company_id',company.id).order('reconciliation_date',{ascending:false}).limit(100),
  supabase.from('clients').select('id,name').eq('company_id',company.id).eq('status','active').order('name'),
  supabase.from('customer_advances').select('id,client_id,quote_id,received_at,amount,applied_amount,status,payment_method,reference,clients(name),quotes(number,prefix,project_name)').eq('company_id',company.id).neq('status','CANCELLED').order('received_at',{ascending:false}).limit(100),
  supabase.from('quotes').select('id,number,prefix,client_id,project_name,total,status,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(250),
  supabase.from('internal_income_records').select('id,receipt_no,client_id,quote_id,work_order_id,amount,concept,received_at,payment_method,reference,notes').eq('company_id',company.id).order('received_at',{ascending:false}).limit(500),
  supabase.from('accounts_receivable').select('id,client_id,quote_id,work_order_id,number,concept,amount_total,amount_paid,due_date,status,dte_document_id,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(500)
 ]);const e=a.error||r.error||c.error||ad.error||q.error||p.error||ar.error;if(e){console.error('[IDEALO SV] Caja load',e);setMsg('No se pudo actualizar toda la información de Caja. Intenta nuevamente.')}else{setMsg('');setAccounts(a.data||[]);setRecs(r.data||[]);setClients(c.data||[]);setAdvances(ad.data||[]);setWorkQuotes(q.data||[]);setWorkPayments(p.data||[]);setReceivableRows(ar.data||[])}}
 useEffect(()=>{load()},[company.id,supabase])
 const receivables=useMemo(()=>receivableRows.map(row=>({...row,pending:pendingAmount(row),client_name:clients.find(c=>c.id===row.client_id)?.name||'Cliente'})).filter(row=>!['PAID','CANCELLED','VOID'].includes(String(row.status||'').toUpperCase())&&row.pending>.009).sort((x,y)=>{const xd=x.due_date||'9999-12-31',yd=y.due_date||'9999-12-31';return xd.localeCompare(yd)||y.pending-x.pending}),[receivableRows,clients])
 const receivablesTotal=useMemo(()=>receivables.reduce((s,x)=>s+x.pending,0),[receivables])
 const k=useMemo(()=>{const active=accounts.filter(x=>x.active!==false),ins=active.reduce((s,x)=>s+Number(x.income_today||0),0),outs=active.reduce((s,x)=>s+Number(x.expense_today||0),0),total=active.reduce((s,x)=>s+Number(x.current_balance||0),0),negative=active.filter(x=>Number(x.current_balance||0)<0),diff=recs.filter(x=>Math.abs(Number(x.difference||0))>.009),pending=advances.filter(x=>['OPEN','PARTIAL'].includes(x.status)).reduce((s,x)=>s+Number(x.amount||0)-Number(x.applied_amount||0),0);return{ins,outs,total,negative,diff,pending}},[accounts,recs,advances])
 const pendingAdvances=advances.filter(x=>['OPEN','PARTIAL'].includes(x.status))
 const alerts=k.negative.length+k.diff.length
 const collectBalance=item=>requestModule('Cuentas por cobrar',{receivableId:item.id,source:'cash-control'})
 return <section className="cash-control">
  <div className="clients-titlebar cash-simple-title"><div><p className="form-kicker">CAJA</p><h2>Caja y bancos</h2><p>Entradas, salidas y cobros conciliados con Facturación.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button type="button" className="secondary" onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Cerrar historial':`Historial${workPayments.length?` (${workPayments.length})`:''}`}</button>{alerts>0&&<button type="button" className="cash-alert-button" onClick={onOpenReports}>{alerts} alerta{alerts===1?'':'s'}</button>}</div></div>
  {msg&&<p className="feedback error">{msg}</p>}
  <div className="cash-control-summary simple"><article><small>Disponible</small><strong>{money(k.total)}</strong></article><article><small>Entradas hoy</small><strong>{money(k.ins)}</strong></article><article><small>Salidas hoy</small><strong>{money(k.outs)}</strong></article></div>
  <CashRegisterShift company={company} supabase={supabase} accounts={accounts} onChanged={load}/>
  <InternalIncomeCard company={company} supabase={supabase} accounts={accounts} clients={clients} onSaved={load}/>
  {receivables.length>0&&<details className="cash-pending-compact" open>
   <summary><span><strong>Cuentas por cobrar</strong><small>{receivables.length} cuenta{receivables.length===1?'':'s'} con saldo real en Facturación</small></span><b>{money(receivablesTotal)}</b></summary>
   <div className="cash-advance-list">{receivables.map(item=><article key={item.id}><div><strong>{item.client_name}</strong><small>{item.number?`CxC #${item.number} · `:''}{item.concept||'Documento facturado'}{item.due_date?` · vence ${item.due_date}`:''}</small></div><div><small>Saldo</small><strong>{money(item.pending)}</strong><button type="button" className="secondary" onClick={()=>collectBalance(item)}>Abrir cobro</button></div></article>)}</div>
  </details>}
  {showHistory&&<CashPaymentHistory company={company} records={workPayments} clients={clients} quotes={workQuotes}/>} 
  {pendingAdvances.length>0&&<details className="cash-pending-compact"><summary><span><strong>Anticipos anteriores</strong><small>{pendingAdvances.length} pendiente{pendingAdvances.length===1?'':'s'} por aplicar</small></span><b>{money(k.pending)}</b></summary><div className="cash-advance-list">{pendingAdvances.map(a=>{const pending=Number(a.amount||0)-Number(a.applied_amount||0);return <article key={a.id}><div><strong>{a.clients?.name||'Cliente'}</strong><small>{a.quotes?`${a.quotes.prefix||'COT'}-${a.quotes.number} · ${a.quotes.project_name||'Proyecto'}`:'Sin proyecto'} · {methodLabel(a.payment_method)} · {a.received_at?new Date(a.received_at).toLocaleDateString('es-SV',{timeZone:'America/El_Salvador'}):'—'}</small></div><div><small>Pendiente</small><strong>{money(pending)}</strong></div></article>})}</div></details>}
  {(alerts>0)&&<section className="cash-alert-strip"><strong>Revisión necesaria</strong><span>{k.negative.length>0?`${k.negative.length} cuenta(s) con saldo negativo. `:''}{k.diff.length>0?`${k.diff.length} diferencia(s) de conciliación.`:''}</span><button type="button" onClick={onOpenReports}>Revisar</button></section>}
 </section>
}
