import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)
const fmtDate=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('es-SV'):'—'
const fmtTime=v=>v?new Date(v).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'}):'—'
const summarizeRows=rows=>{
  const income=rows.filter(r=>['INCOME','TRANSFER_IN'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0)
  const expense=rows.filter(r=>['EXPENSE','TRANSFER_OUT'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0)
  return {income,expense,count:rows.length}
}

export default function CashRegisterShift({company,supabase,accounts=[],onChanged}){
  const cashAccounts=useMemo(()=>accounts.filter(a=>a.active!==false&&a.account_type!=='BANK'),[accounts])
  const [accountId,setAccountId]=useState('')
  const [opening,setOpening]=useState('')
  const [session,setSession]=useState(null)
  const [lastCut,setLastCut]=useState(null)
  const [history,setHistory]=useState([])
  const [historyStats,setHistoryStats]=useState({})
  const [cutsBySession,setCutsBySession]=useState({})
  const [summary,setSummary]=useState({income:0,expense:0,expected:0,count:0})
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [closeDialog,setCloseDialog]=useState({open:false,expected:0,counted:'',notes:''})

  useEffect(()=>{
    if(!accountId&&cashAccounts.length){
      setAccountId(cashAccounts[0].cash_account_id)
      setOpening(String(Number(cashAccounts[0].current_balance||0).toFixed(2)))
    }
  },[cashAccounts,accountId])

  const calculate=async current=>{
    if(!current)return {income:0,expense:0,expected:0,count:0}
    const query=supabase.from('cash_movements')
      .select('movement_type,amount,movement_date')
      .eq('company_id',company.id)
      .eq('cash_account_id',current.cash_account_id)
      .gte('movement_date',current.opened_at)
    if(current.closed_at)query.lte('movement_date',current.closed_at)
    const {data,error}=await query
    if(error)throw error
    const totals=summarizeRows(data||[])
    return {...totals,expected:Number(current.opening_balance||0)+totals.income-totals.expense}
  }

  const load=async()=>{
    if(!company?.id)return
    const [{data:openData,error:openError},{data:historyData,error:historyError}]=await Promise.all([
      supabase.from('cash_register_sessions').select('*').eq('company_id',company.id).eq('status','OPEN').order('opened_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('cash_register_sessions').select('*').eq('company_id',company.id).order('opened_at',{ascending:false}).limit(30)
    ])
    if(openError||historyError){setMessage((openError||historyError).message);return}
    const rows=historyData||[]
    setSession(openData||null)
    setHistory(rows)

    if(rows.length){
      const ids=rows.map(x=>x.id)
      const oldest=rows.reduce((min,x)=>!min||x.opened_at<min?x.opened_at:min,'')
      const [{data:cuts},{data:movements,error:movementError}]=await Promise.all([
        supabase.from('cash_register_cuts').select('session_id,cut_at,expected_balance,income_total,expense_total,movement_count').in('session_id',ids).order('cut_at',{ascending:false}),
        supabase.from('cash_movements').select('cash_account_id,movement_type,amount,movement_date').eq('company_id',company.id).gte('movement_date',oldest).order('movement_date',{ascending:true})
      ])
      if(movementError){setMessage(movementError.message);return}
      const grouped={}
      ;(cuts||[]).forEach(c=>{(grouped[c.session_id]||(grouped[c.session_id]=[])).push(c)})
      setCutsBySession(grouped)
      const stats={}
      rows.forEach(h=>{
        const start=new Date(h.opened_at).getTime(),end=h.closed_at?new Date(h.closed_at).getTime():Date.now()
        const related=(movements||[]).filter(m=>m.cash_account_id===h.cash_account_id&&new Date(m.movement_date).getTime()>=start&&new Date(m.movement_date).getTime()<=end)
        stats[h.id]=summarizeRows(related)
      })
      setHistoryStats(stats)
    }else{
      setCutsBySession({})
      setHistoryStats({})
    }

    if(openData){
      setAccountId(openData.cash_account_id)
      try{setSummary(await calculate(openData))}catch(e){setMessage(e.message)}
      const {data:cut}=await supabase.from('cash_register_cuts').select('*').eq('session_id',openData.id).order('cut_at',{ascending:false}).limit(1).maybeSingle()
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
      setSummary(s);setLastCut(data);setMessage(`Corte realizado. Efectivo esperado ${money(s.expected)}.`);await load()
    }catch(e){setMessage(e.message)}
    setBusy(false)
  }

  const openCloseDialog=async()=>{
    if(!session)return
    setBusy(true);setMessage('')
    try{
      const s=await calculate(session)
      setSummary(s)
      setCloseDialog({open:true,expected:s.expected,counted:Number(s.expected).toFixed(2),notes:''})
    }catch(e){setMessage(e.message)}
    setBusy(false)
  }

  const confirmClose=async()=>{
    if(!session)return
    const counted=Number(closeDialog.counted)
    if(!Number.isFinite(counted)||counted<0){setMessage('Ingresa un efectivo contado válido.');return}
    const difference=Number((counted-Number(closeDialog.expected||0)).toFixed(2))
    setBusy(true);setMessage('')
    try{
      const {error}=await supabase.from('cash_register_sessions').update({
        status:'CLOSED',
        closing_expected:Number(closeDialog.expected||0),
        closing_counted:counted,
        difference,
        notes:closeDialog.notes.trim()||null,
        closed_at:new Date().toISOString()
      }).eq('id',session.id).eq('company_id',company.id)
      if(error)throw error
      const label=Math.abs(difference)<.005?'sin diferencia':difference>0?`sobrante ${money(difference)}`:`faltante ${money(Math.abs(difference))}`
      setCloseDialog({open:false,expected:0,counted:'',notes:''})
      setMessage(`Caja cerrada: ${label}.`)
      setSession(null);setSummary({income:0,expense:0,expected:0,count:0});setLastCut(null)
      const selected=cashAccounts.find(a=>a.cash_account_id===accountId)
      setOpening(String(Number(selected?.current_balance||0).toFixed(2)))
      await load();onChanged?.()
    }catch(e){setMessage(e.message)}
    setBusy(false)
  }

  const activeAccount=accounts.find(a=>a.cash_account_id===(session?.cash_account_id||accountId))
  const closeDifference=Number(closeDialog.counted||0)-Number(closeDialog.expected||0)
  const closeDifferenceLabel=Math.abs(closeDifference)<.005?'Cuadra exacto':closeDifference>0?`Sobrante ${money(closeDifference)}`:`Faltante ${money(Math.abs(closeDifference))}`

  return <>
    <section className="cash-shift-card">
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
        <div className="cash-shift-actions"><span>{activeAccount?.name||'Caja'} · abierta {fmtTime(session.opened_at)}{lastCut?` · último corte ${fmtTime(lastCut.cut_at)}`:''}</span><div><button type="button" className="secondary" disabled={busy} onClick={makeCut}>Hacer corte</button><button type="button" className="close" disabled={busy} onClick={openCloseDialog}>Cerrar caja</button></div></div>
      </>}
      {message&&<p className="cash-shift-message">{message}</p>}
    </section>

    {history.length>0&&<details className="cash-shift-history">
      <summary><span><strong>Historial de turnos</strong><small>{history.length} turno{history.length===1?'':'s'} registrado{history.length===1?'':'s'}</small></span><b>Ver historial</b></summary>
      <div className="cash-history-list">
        {history.map(h=>{const account=accounts.find(a=>a.cash_account_id===h.cash_account_id);const cuts=cutsBySession[h.id]||[];const stats=historyStats[h.id]||{income:0,expense:0};const diff=Number(h.difference||0);const expected=h.status==='OPEN'?Number(h.opening_balance||0)+stats.income-stats.expense:Number(h.closing_expected||0);return <article key={h.id}>
          <div className="cash-history-main"><div><strong>{fmtDate(h.business_date)} · {account?.name||'Caja'}</strong><small>{h.status==='OPEN'?`Abierta ${fmtTime(h.opened_at)}`:`Cerrada ${fmtTime(h.closed_at)}`}{cuts.length?` · ${cuts.length} corte${cuts.length===1?'':'s'}`:''}</small></div><span className={`cash-history-status ${h.status==='OPEN'?'open':'closed'}`}>{h.status==='OPEN'?'ABIERTA':'CERRADA'}</span></div>
          <div className="cash-history-values"><span><small>Apertura</small><b>{money(h.opening_balance)}</b></span><span><small>Entradas</small><b>{money(stats.income)}</b></span><span><small>Salidas</small><b>{money(stats.expense)}</b></span><span><small>Esperado</small><b>{money(expected)}</b></span><span><small>Contado</small><b>{h.status==='OPEN'?'—':money(h.closing_counted)}</b></span><span className={h.status==='OPEN'?'':Math.abs(diff)<.005?'ok':diff>0?'plus':'minus'}><small>Diferencia</small><b>{h.status==='OPEN'?'—':money(diff)}</b></span></div>
          {h.notes&&<p className="cash-history-note">Observación: {h.notes}</p>}
          {cuts.length>0&&<details className="cash-history-cuts"><summary>Ver cortes ({cuts.length})</summary><div>{cuts.map((c,i)=><p key={`${h.id}-${c.cut_at}-${i}`}><span>{fmtTime(c.cut_at)}</span><span>Entradas {money(c.income_total)}</span><span>Salidas {money(c.expense_total)}</span><strong>Esperado {money(c.expected_balance)}</strong></p>)}</div></details>}
        </article>})}
      </div>
    </details>}

    {closeDialog.open&&<div className="cash-close-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setCloseDialog({open:false,expected:0,counted:'',notes:''})}}>
      <section className="cash-close-modal" role="dialog" aria-modal="true" aria-labelledby="cash-close-title">
        <div className="cash-close-head"><div><p className="form-kicker">CIERRE DE CAJA</p><h3 id="cash-close-title">Confirmar cierre</h3><small>{activeAccount?.name||'Caja principal'}</small></div><button type="button" className="cash-close-x" disabled={busy} onClick={()=>setCloseDialog({open:false,expected:0,counted:'',notes:''})}>×</button></div>
        <div className="cash-close-summary">
          <article><small>Efectivo esperado</small><strong>{money(closeDialog.expected)}</strong></article>
          <article><small>Efectivo contado</small><strong>{money(closeDialog.counted)}</strong></article>
          <article className={Math.abs(closeDifference)<.005?'ok':closeDifference>0?'plus':'minus'}><small>Diferencia</small><strong>{money(closeDifference)}</strong><em>{closeDifferenceLabel}</em></article>
        </div>
        <label className="cash-close-field">Efectivo contado físicamente<input autoFocus type="number" min="0" step="0.01" value={closeDialog.counted} onChange={e=>setCloseDialog(v=>({...v,counted:e.target.value}))}/></label>
        <label className="cash-close-field">Observación <span>(opcional)</span><textarea rows="3" maxLength="300" value={closeDialog.notes} onChange={e=>setCloseDialog(v=>({...v,notes:e.target.value}))} placeholder="Ej. cambio dejado para mañana, diferencia revisada, etc."/></label>
        <div className="cash-close-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setCloseDialog({open:false,expected:0,counted:'',notes:''})}>Cancelar</button><button type="button" className="confirm" disabled={busy||!Number.isFinite(Number(closeDialog.counted))||Number(closeDialog.counted)<0} onClick={confirmClose}>{busy?'Cerrando…':'Confirmar cierre'}</button></div>
      </section>
    </div>}
  </>
}
