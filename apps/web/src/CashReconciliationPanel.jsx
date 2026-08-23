import { useEffect,useMemo,useState } from 'react'

const money=(v)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)

export default function CashReconciliationPanel({company,supabase}){
  const [accounts,setAccounts]=useState([]),[rows,setRows]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [form,setForm]=useState({cash_account_id:'',statement_balance:'',reconciliation_date:today(),reference:'',notes:''})
  const load=async()=>{
    const [a,r]=await Promise.all([
      supabase.from('cash_account_balances').select('*').eq('company_id',company.id).eq('active',true).order('name'),
      supabase.from('cash_reconciliations').select('*,cash_accounts(name,account_type)').eq('company_id',company.id).order('reconciliation_date',{ascending:false}).limit(30)
    ])
    if(a.error||r.error)setMessage(a.error?.message||r.error?.message)
    else{setAccounts(a.data||[]);setRows(r.data||[]);setForm(v=>({...v,cash_account_id:v.cash_account_id||a.data?.[0]?.cash_account_id||''}))}
  }
  useEffect(()=>{load()},[company.id])
  const selected=accounts.find(a=>a.cash_account_id===form.cash_account_id)
  const diff=form.statement_balance===''?null:Number(form.statement_balance)-Number(selected?.current_balance||0)
  const totals=useMemo(()=>accounts.reduce((acc,a)=>({balance:acc.balance+Number(a.current_balance||0),income:acc.income+Number(a.income_today||0),expense:acc.expense+Number(a.expense_today||0)}),{balance:0,income:0,expense:0}),[accounts])
  const reconcile=async(e)=>{
    e.preventDefault();if(!selected)return setMessage('Seleccioná una cuenta.');setBusy(true);setMessage('')
    const {error}=await supabase.rpc('reconcile_cash_account',{p_cash_account:selected.cash_account_id,p_statement_balance:Number(form.statement_balance||0),p_date:form.reconciliation_date,p_reference:form.reference||null,p_notes:form.notes||null})
    setBusy(false);if(error)return setMessage(error.message);setMessage('Conciliación guardada.');setForm(v=>({...v,statement_balance:'',reference:'',notes:''}));await load()
  }
  return <section className="panel">
    <div className="panel-heading"><div><p className="form-kicker">CAJA Y BANCOS</p><h3>Conciliación y flujo de efectivo</h3><p>Compara el saldo del ERP contra caja física o estado bancario y detecta diferencias.</p></div></div>
    <div className="metrics-grid"><article className="metric-card"><span>Saldo total</span><strong>{money(totals.balance)}</strong></article><article className="metric-card"><span>Entradas hoy</span><strong>{money(totals.income)}</strong></article><article className="metric-card"><span>Salidas hoy</span><strong>{money(totals.expense)}</strong></article><article className="metric-card"><span>Flujo neto hoy</span><strong>{money(totals.income-totals.expense)}</strong></article></div>
    {message&&<p className="feedback success">{message}</p>}
    <div className="module-grid two-column">
      <form onSubmit={reconcile} className="panel"><div className="form-grid">
        <label className="field"><span>Cuenta *</span><select required value={form.cash_account_id} onChange={e=>setForm({...form,cash_account_id:e.target.value})}><option value="">Seleccionar cuenta</option>{accounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name} · {money(a.current_balance)}</option>)}</select></label>
        <label className="field"><span>Fecha *</span><input type="date" required value={form.reconciliation_date} onChange={e=>setForm({...form,reconciliation_date:e.target.value})}/></label>
        <label className="field"><span>Saldo ERP</span><input readOnly value={selected?money(selected.current_balance):''}/></label>
        <label className="field"><span>Saldo contado / banco *</span><input type="number" step="0.01" required value={form.statement_balance} onChange={e=>setForm({...form,statement_balance:e.target.value})}/></label>
        <label className="field"><span>Diferencia</span><input readOnly value={diff===null?'':money(diff)}/></label>
        <label className="field"><span>Referencia</span><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></label>
        <label className="field form-span-2"><span>Notas</span><textarea rows="2" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </div><div className="form-actions end"><button disabled={busy}>{busy?'Conciliando…':'Guardar conciliación'}</button></div></form>
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">SALDOS</p><h3>Por cuenta</h3></div></div>{accounts.length?<div className="client-list">{accounts.map(a=><div className="client-row" key={a.cash_account_id}><div><strong>{a.name}</strong><small>{a.account_type} · hoy +{money(a.income_today)} / -{money(a.expense_today)}</small></div><div><strong>{money(a.current_balance)}</strong></div></div>)}</div>:<div className="empty-state"><strong>Sin cuentas activas</strong></div>}</section>
    </div>
    {rows.length>0&&<div className="client-table-wrap"><table className="client-table"><thead><tr><th>Fecha</th><th>Cuenta</th><th>ERP</th><th>Contado/Banco</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.reconciliation_date}</td><td>{r.cash_accounts?.name||'Cuenta'}</td><td>{money(r.system_balance)}</td><td>{money(r.statement_balance)}</td><td>{money(r.difference)}</td><td><span className={r.status==='MATCHED'?'status dte-ready':'status dte-pending'}>{r.status}</span></td></tr>)}</tbody></table></div>}
  </section>
}
