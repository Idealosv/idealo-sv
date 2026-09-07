import {useEffect,useMemo,useState} from 'react'
import CashRegisterShift from './CashRegisterShift.jsx'
import InternalIncomeCard from './InternalIncomeCard.jsx'
import CashPaymentHistory from './CashPaymentHistory.jsx'
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const day=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const methodLabel=value=>({CASH:'Efectivo',TRANSFER:'Transferencia',CARD:'Tarjeta',CHECK:'Cheque',OTHER:'Otro'}[value]||value||'Pago')
export default function CashControlCenter({company,supabase,onOpenReports}){
 const [accounts,setAccounts]=useState([]),[moves,setMoves]=useState([]),[recs,setRecs]=useState([]),[clients,setClients]=useState([]),[advances,setAdvances]=useState([]),[workQuotes,setWorkQuotes]=useState([]),[workPayments,setWorkPayments]=useState([]),[collectionRequest,setCollectionRequest]=useState(null),[showHistory,setShowHistory]=useState(false),[msg,setMsg]=useState('')
 const load=async()=>{const [a,m,r,c,ad,q,p]=await Promise.all([
  supabase.from('cash_account_balances').select('cash_account_id,name,account_type,active,current_balance,income_today,expense_today').eq('company_id',company.id),
  supabase.from('cash_movements').select('id,movement_date,movement_type,amount,concept,cash_account_id').eq('company_id',company.id).order('movement_date',{ascending:false}).limit(250),
  supabase.from('cash_reconciliations').select('id,cash_account_id,status,difference,reconciliation_date').eq('company_id',company.id).order('reconciliation_date',{ascending:false}).limit(100),
  supabase.from('clients').select('id,name').eq('company_id',company.id).eq('status','active').order('name'),
  supabase.from('customer_advances').select('id,client_id,quote_id,received_at,amount,applied_amount,status,payment_method,reference,clients(name),quotes(number,prefix,project_name)').eq('company_id',company.id).neq('status','CANCELLED').order('received_at',{ascending:false}).limit(100),
  supabase.from('quotes').select('id,number,prefix,client_id,project_name,total,status,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(250),
  supabase.from('internal_income_records').select('id,receipt_no,client_id,quote_id,work_order_id,amount,concept,received_at,payment_method,reference,notes').eq('company_id',company.id).order('received_at',{ascending:false}).limit(500)
 ]);const e=a.error||m.error||r.error||c.error||ad.error||q.error||p.error;if(e)setMsg(e.message);else{setMsg('');setAccounts(a.data||[]);setMoves(m.data||[]);setRecs(r.data||[]);setClients(c.data||[]);setAdvances(ad.data||[]);setWorkQuotes(q.data||[]);setWorkPayments(p.data||[])}}
 useEffect(()=>{load()},[company.id,supabase])
 const receivables=useMemo(()=>{const paidByQuote=new Map();for(const payment of workPayments){if(!payment.quote_id)continue;paidByQuote.set(payment.quote_id,(paidByQuote.get(payment.quote_id)||0)+Number(payment.amount||0))}return workQuotes.map(q=>{const total=Number(q.total||0),paid=paidByQuote.get(q.id)||0,pending=Math.max(0,total-paid),client=clients.find(c=>c.id===q.client_id);return{...q,total,paid,pending,client_name:client?.name||'Cliente'}}).filter(q=>q.paid>0&&q.pending>.009).sort((x,y)=>y.pending-x.pending)},[workQuotes,workPayments,clients])
 const receivablesTotal=useMemo(()=>receivables.reduce((s,x)=>s+x.pending,0),[receivables])
 const k=useMemo(()=>{const t=day(),today=moves.filter(x=>x.movement_date&&day(new Date(x.movement_date))===t),ins=today.filter(x=>['INCOME','TRANSFER_IN'].includes(x.movement_type)).reduce((s,x)=>s+Number(x.amount||0),0),outs=today.filter(x=>['EXPENSE','TRANSFER_OUT'].includes(x.movement_type)).reduce((s,x)=>s+Number(x.amount||0),0),total=accounts.filter(x=>x.active!==false).reduce((s,x)=>s+Number(x.current_balance||0),0),negative=accounts.filter(x=>Number(x.current_balance||0)<0),diff=recs.filter(x=>Math.abs(Number(x.difference||0))>.009),pending=advances.filter(x=>['OPEN','PARTIAL'].includes(x.status)).reduce((s,x)=>s+Number(x.amount||0)-Number(x.applied_amount||0),0);return{ins,outs,total,negative,diff,today,pending}},[accounts,moves,recs,advances])
 const pendingAdvances=advances.filter(x=>['OPEN','PARTIAL'].includes(x.status))
 const alerts=k.negative.length+k.diff.length
 const collectBalance=item=>{setCollectionRequest({quote_id:item.id,client_id:item.client_id,amount:item.pending,nonce:Date.now()});window.setTimeout(()=>document.querySelector('.internal-income-card')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}
 return <section className="cash-control">
  <div className="clients-titlebar cash-simple-title"><div><p className="form-kicker">CAJA</p><h2>Caja y bancos</h2><p>Entradas, salidas y cobros.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><button type="button" className="secondary" onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Cerrar historial':`Historial${workPayments.length?` (${workPayments.length})`:''}`}</button>{alerts>0&&<button type="button" className="cash-alert-button" onClick={onOpenReports}>{alerts} alerta{alerts===1?'':'s'}</button>}</div></div>
  {msg&&<p className="feedback error">{msg}</p>}
  <div className="cash-control-summary simple"><article><small>Disponible</small><strong>{money(k.total)}</strong></article><article><small>Entradas hoy</small><strong>{money(k.ins)}</strong></article><article><small>Salidas hoy</small><strong>{money(k.outs)}</strong></article></div>
  <CashRegisterShift company={company} supabase={supabase} accounts={accounts} onChanged={load}/>
  <InternalIncomeCard company={company} supabase={supabase} accounts={accounts} clients={clients} collectionRequest={collectionRequest} onSaved={load}/>
  {receivables.length>0&&<details className="cash-pending-compact" open>
   <summary><span><strong>Por cobrar</strong><small>{receivables.length} trabajo{receivables.length===1?'':'s'} con saldo</small></span><b>{money(receivablesTotal)}</b></summary>
   <div className="cash-advance-list">{receivables.map(item=><article key={item.id}><div><strong>{item.client_name}</strong><small>{item.prefix||'COT'}-{item.number} · {item.project_name||'Trabajo'} · Abonado {money(item.paid)} de {money(item.total)}</small></div><div><small>Saldo</small><strong>{money(item.pending)}</strong><button type="button" className="secondary" onClick={()=>collectBalance(item)}>Cobrar</button></div></article>)}</div>
  </details>}
  {showHistory&&<CashPaymentHistory company={company} records={workPayments} clients={clients} quotes={workQuotes}/>} 
  {pendingAdvances.length>0&&<details className="cash-pending-compact"><summary><span><strong>Anticipos anteriores</strong><small>{pendingAdvances.length} pendiente{pendingAdvances.length===1?'':'s'} por aplicar</small></span><b>{money(k.pending)}</b></summary><div className="cash-advance-list">{pendingAdvances.map(a=>{const pending=Number(a.amount||0)-Number(a.applied_amount||0);return <article key={a.id}><div><strong>{a.clients?.name||'Cliente'}</strong><small>{a.quotes?`${a.quotes.prefix||'COT'}-${a.quotes.number} · ${a.quotes.project_name||'Proyecto'}`:'Sin proyecto'} · {methodLabel(a.payment_method)} · {a.received_at?new Date(a.received_at).toLocaleDateString('es-SV'):'—'}</small></div><div><small>Pendiente</small><strong>{money(pending)}</strong></div></article>})}</div></details>}
  {(alerts>0)&&<section className="cash-alert-strip"><strong>Revisión necesaria</strong><span>{k.negative.length>0?`${k.negative.length} cuenta(s) con saldo negativo. `:''}{k.diff.length>0?`${k.diff.length} diferencia(s) de conciliación.`:''}</span><button type="button" onClick={onOpenReports}>Revisar</button></section>}
 </section>
}
