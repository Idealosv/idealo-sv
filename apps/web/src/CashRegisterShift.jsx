import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)

export default function CashRegisterShift({company,supabase,accounts=[],onChanged}){
  const cashAccounts=useMemo(()=>accounts.filter(a=>a.active!==false&&a.account_type!=='BANK'),[accounts])
  const [accountId,setAccountId]=useState('')
  const [opening,setOpening]=useState('')
  const [session,setSession]=useState(null)
  const [lastCut,setLastCut]=useState(null)
  const [summary,setSummary]=useState({income:0,expense:0,expected:0,count:0})
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    if(!accountId&&cashAccounts.length){
      setAccountId(cashAccounts[0].cash_account_id)
      setOpening(String(Number(cashAccounts[0].current_balance||0).toFixed(2)))
    }
  },[cashAccounts,accountId])

  const calculate=async current=>{
    if(!current)return {income:0,expense:0,expected:0,count:0}
    const {data,error}=await supabase.from('cash_movements')
      .select('movement_type,amount,movement_date')
      .eq('company_id',company.id)
      .eq('cash_account_id',current.cash_account_id)
      .gte('movement_date',current.opened_at)
    if(error)throw error
    const rows=data||[]
    const income=rows.filter(r=>['INCOME','TRANSFER_IN'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0)
    const expense=rows.filter(r=>['EXPENSE','TRANSFER_OUT'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0)
    return {income,expense,expected:Number(current.opening_balance||0)+income-expense,count:rows.length}
  }

  const load=async()=>{
    if(!company?.id)return
    const {data,error}=await supabase.from('cash_register_sessions')
      .select('*')
      .eq('company_id',company.id)
      .eq('status','OPEN')
      .order('opened_at',{ascending:false})
      .limit(1)
      .maybeSingle()
    if(error){setMessage(error.message);return}
    setSession(data||null)
    if(data){
      setAccountId(data.cash_account_id)
      try{setSummary(await calculate(data))}catch(e){setMessage(e.message)}
      const {data:cut}=await supabase.from('cash_register_cuts').select('*').eq('session_id',data.id).order('cut_at',{ascending:false}).limit(1).maybeSingle()
      setLastCut(cut||null)
    }else{
      setSummary({income:0,expense:0,expected:0,count:0})
      setLastCut(null)
    }
  }

  useEffect(()=>{load()},[company?.id])

  const openRegister=async()=>{
    if(!accountId){setMessage('Selecciona una caja.');return}
    const amount=Number(opening)
    if(!Number.isFinite(amount)||amount<0){setMessage('Ingresa un efectivo inicial válido.');return}
    setBusy(true);setMessage('')
    const {error}=await supabase.from('cash_register_sessions').insert({company_id:company.id,cash_account_id:accountId,business_date:today(),opening_balance:amount})
    if(error)setMessage(error.message);else{setMessage(`Caja abierta con ${money(amount)}.`);await load();onChanged?.()}
    setBusy(false)
  }

  const makeCut=async()=>{
    if(!session)return
    setBusy(true);setMessage('')
    try{
      const s=await calculate(session)
      const {data,error}=await supabase.from('cash_register_cuts').insert({session_id:session.id,company_id:company.id,cash_account_id:session.cash_account_id,expected_balance:s.expected,income_total:s.income,expense_total:s.expense,movement_count:s.count}).select('*').single()
      if(error)throw error
      setSummary(s);setLastCut(data);setMessage(`Corte realizado. Efectivo esperado ${money(s.expected)}.`)
    }catch(e){setMessage(e.message)}
    setBusy(false)
  }

  const closeRegister=async()=>{
    if(!session)return
    setBusy(true);setMessage('')
    try{
      const s=await calculate(session)
      const entered=window.prompt(`Cierre de caja\nEfectivo esperado: ${money(s.expected)}\n¿Cuánto efectivo contaste físicamente?`,Number(s.expected).toFixed(2))
      if(entered===null){setBusy(false);return}
      const counted=Number(entered)
      if(!Number.isFinite(counted)||counted<0)throw new Error('Ingresa un monto contado válido.')
      const difference=Number((counted-s.expected).toFixed(2))
      const {error}=await supabase.from('cash_register_sessions').update({status:'CLOSED',closing_expected:s.expected,closing_counted:counted,difference,closed_at:new Date().toISOString()}).eq('id',session.id).eq('company_id',company.id)
      if(error)throw error
      const label=Math.abs(difference)<.005?'sin diferencia':difference>0?`sobrante ${money(difference)}`:`faltante ${money(Math.abs(difference))}`
      setMessage(`Caja cerrada: ${label}.`)
      setSession(null);setSummary({income:0,expense:0,expected:0,count:0});setLastCut(null)
      const selected=cashAccounts.find(a=>a.cash_account_id===accountId)
      setOpening(String(Number(selected?.current_balance||0).toFixed(2)))
      onChanged?.()
    }catch(e){setMessage(e.message)}
    setBusy(false)
  }

  const activeAccount=accounts.find(a=>a.cash_account_id===(session?.cash_account_id||accountId))

  return <section className="cash-shift-card">
    <div className="cash-shift-head">
      <div><p className="form-kicker">TURNO DE CAJA</p><h3>{session?'Caja abierta':'Apertura · corte · cierre'}</h3></div>
      <span className={`cash-shift-status ${session?'open':'closed'}`}>{session?'ABIERTA':'SIN APERTURA'}</span>
    </div>
    {!session?<div className="cash-shift-open">
      <label>Caja<select value={accountId} onChange={e=>{setAccountId(e.target.value);const a=cashAccounts.find(x=>x.cash_account_id===e.target.value);setOpening(String(Number(a?.current_balance||0).toFixed(2)))}}>{cashAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name}</option>)}</select></label>
      <label>Efectivo inicial<input type="number" min="0" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label>
      <button type="button" disabled={busy||!cashAccounts.length} onClick={openRegister}>Abrir caja</button>
    </div>:<>
      <div className="cash-shift-summary">
        <article><small>Apertura</small><strong>{money(session.opening_balance)}</strong></article>
        <article><small>Entradas</small><strong>+ {money(summary.income)}</strong></article>
        <article><small>Salidas</small><strong>- {money(summary.expense)}</strong></article>
        <article className="expected"><small>Efectivo esperado</small><strong>{money(summary.expected)}</strong></article>
      </div>
      <div className="cash-shift-actions"><span>{activeAccount?.name||'Caja'} · abierta {new Date(session.opened_at).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}{lastCut?` · último corte ${new Date(lastCut.cut_at).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}`:''}</span><div><button type="button" className="secondary" disabled={busy} onClick={makeCut}>Hacer corte</button><button type="button" className="close" disabled={busy} onClick={closeRegister}>Cerrar caja</button></div></div>
    </>}
    {message&&<p className="cash-shift-message">{message}</p>}
  </section>
}
