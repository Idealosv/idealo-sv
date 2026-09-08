import {useEffect,useMemo,useState} from 'react'
import CashShiftReport from './CashShiftReport.jsx'
import {localIsoDate} from './billingReceivables.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const fmtDate=v=>v?new Date(`${v}T12:00:00-06:00`).toLocaleDateString('es-SV',{timeZone:'America/El_Salvador'}):'—'
const fmtTime=v=>v?new Date(v).toLocaleTimeString('es-SV',{timeZone:'America/El_Salvador',hour:'2-digit',minute:'2-digit'}):'—'
const summarizeRows=rows=>{const income=rows.filter(r=>['INCOME','TRANSFER_IN'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0),expense=rows.filter(r=>['EXPENSE','TRANSFER_OUT'].includes(r.movement_type)).reduce((s,r)=>s+Number(r.amount||0),0);return{income,expense,count:rows.length}}
const safeError=(error,fallback)=>{console.error('[IDEALO SV] turno Caja',error);const text=String(error?.message||'');return /permission|function|relation|column|schema|syntax|database/i.test(text)?fallback:(text||fallback)}

export default function CashRegisterShift({company,supabase,accounts=[],onChanged}){
  const cashAccounts=useMemo(()=>accounts.filter(a=>a.active!==false&&a.account_type!=='BANK'),[accounts])
  const [accountId,setAccountId]=useState(''),[opening,setOpening]=useState('0.00'),[openSessions,setOpenSessions]=useState([]),[history,setHistory]=useState([]),[historyStats,setHistoryStats]=useState({}),[cutsBySession,setCutsBySession]=useState({}),[summary,setSummary]=useState({income:0,expense:0,expected:0,count:0}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[closeDialog,setCloseDialog]=useState({open:false,expected:0,counted:'',notes:''}),[reportSession,setReportSession]=useState(null)
  const session=useMemo(()=>openSessions.find(row=>row.cash_account_id===accountId)||null,[openSessions,accountId])
  const lastCut=useMemo(()=>session?(cutsBySession[session.id]||[])[0]||null:null,[session,cutsBySession])

  useEffect(()=>{if(!accountId&&cashAccounts.length)setAccountId(cashAccounts[0].cash_account_id)},[cashAccounts,accountId])

  const calculate=async current=>{if(!current)return{income:0,expense:0,expected:0,count:0};const {data,error}=await supabase.from('cash_movements').select('movement_type,amount,movement_date').eq('company_id',company.id).eq('cash_register_session_id',current.id);if(error)throw error;const totals=summarizeRows(data||[]);return{...totals,expected:Number(current.opening_balance||0)+totals.income-totals.expense}}

  const load=async()=>{
    if(!company?.id)return
    const [{data:openData,error:openError},{data:historyData,error:historyError}]=await Promise.all([
      supabase.from('cash_register_sessions').select('*').eq('company_id',company.id).eq('status','OPEN').order('opened_at',{ascending:false}),
      supabase.from('cash_register_sessions').select('*').eq('company_id',company.id).order('opened_at',{ascending:false}).limit(30)
    ])
    if(openError||historyError){setMessage(safeError(openError||historyError,'No se pudieron cargar los turnos de Caja.'));return}
    const opens=openData||[],rows=historyData||[]
    setOpenSessions(opens);setHistory(rows)
    const effective=accountId||opens[0]?.cash_account_id||cashAccounts[0]?.cash_account_id||''
    if(effective&&!accountId)setAccountId(effective)
    if(rows.length){
      const ids=rows.map(x=>x.id)
      const [{data:cuts,error:cutError},{data:movements,error:movementError}]=await Promise.all([
        supabase.from('cash_register_cuts').select('session_id,cut_at,expected_balance,income_total,expense_total,movement_count').in('session_id',ids).order('cut_at',{ascending:false}),
        supabase.from('cash_movements').select('cash_register_session_id,movement_type,amount,movement_date').eq('company_id',company.id).in('cash_register_session_id',ids)
      ])
      if(cutError||movementError){setMessage(safeError(cutError||movementError,'No se pudo cargar el detalle de los turnos.'));return}
      const grouped={};(cuts||[]).forEach(c=>{(grouped[c.session_id]||(grouped[c.session_id]=[])).push(c)});setCutsBySession(grouped)
      const stats={};rows.forEach(h=>{stats[h.id]=summarizeRows((movements||[]).filter(m=>m.cash_register_session_id===h.id))});setHistoryStats(stats)
    }else{setCutsBySession({});setHistoryStats({})}
    const current=opens.find(row=>row.cash_account_id===effective)||null
    try{setSummary(await calculate(current));setMessage('')}catch(e){setMessage(safeError(e,'No se pudo calcular el turno de Caja.'))}
  }

  useEffect(()=>{load()},[company?.id,accountId])

  const openRegister=async()=>{
    if(!accountId){setMessage('Selecciona una caja.');return}
    const amount=Number(String(opening).trim());if(!Number.isFinite(amount)||amount<0){setMessage('Ingresa un efectivo inicial válido, desde $0.00.');return}
    setBusy(true);setMessage('')
    const {error}=await supabase.rpc('open_cash_register',{p_company:company.id,p_cash_account:accountId,p_opening_balance:amount,p_business_date:localIsoDate()})
    if(error)setMessage(safeError(error,'No se pudo abrir la caja.'));else{setMessage(`Caja abierta con ${money(amount)}.`);await load();onChanged?.()}
    setBusy(false)
  }

  const makeCut=async()=>{
    if(!session)return;setBusy(true);setMessage('')
    try{const s=await calculate(session);const {error}=await supabase.rpc('create_cash_register_cut',{p_session:session.id,p_notes:null});if(error)throw error;setSummary(s);setMessage(`Corte realizado. Efectivo esperado ${money(s.expected)}.`);await load()}catch(e){setMessage(safeError(e,'No se pudo realizar el corte.'))}finally{setBusy(false)}
  }

  const openCloseDialog=async()=>{if(!session)return;setBusy(true);setMessage('');try{const s=await calculate(session);setSummary(s);setCloseDialog({open:true,expected:s.expected,counted:Number(s.expected).toFixed(2),notes:''})}catch(e){setMessage(safeError(e,'No se pudo preparar el cierre.'))}finally{setBusy(false)}}

  const confirmClose=async()=>{
    if(!session)return;const counted=Number(closeDialog.counted);if(!Number.isFinite(counted)||counted<0){setMessage('Ingresa un efectivo contado válido.');return}
    const difference=Number((counted-Number(closeDialog.expected||0)).toFixed(2));if(Math.abs(difference)>=.01&&String(closeDialog.notes||'').trim().length<4){setMessage('Explica la diferencia antes de cerrar la caja.');return}
    setBusy(true);setMessage('')
    try{const {error}=await supabase.rpc('close_cash_register',{p_session:session.id,p_counted:counted,p_notes:closeDialog.notes.trim()||null});if(error)throw error;const label=Math.abs(difference)<.005?'sin diferencia':difference>0?`sobrante ${money(difference)}`:`faltante ${money(Math.abs(difference))}`;setCloseDialog({open:false,expected:0,counted:'',notes:''});setMessage(`Caja cerrada: ${label}.`);setOpening('0.00');await load();onChanged?.()}catch(e){setMessage(safeError(e,'No se pudo cerrar la caja.'))}finally{setBusy(false)}
  }

  const activeAccount=accounts.find(a=>a.cash_account_id===accountId),closeDifference=Number(closeDialog.counted||0)-Number(closeDialog.expected||0),closeDifferenceLabel=Math.abs(closeDifference)<.005?'Cuadra exacto':closeDifference>0?`Sobrante ${money(closeDifference)}`:`Faltante ${money(Math.abs(closeDifference))}`

  return <>
    <section className="cash-shift-card">
      <div className="cash-shift-head"><div><p className="form-kicker">TURNO DE CAJA</p><h3>{session?'Caja abierta':'Apertura · corte · cierre'}</h3></div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>{cashAccounts.length>1&&<select aria-label="Caja a gestionar" value={accountId} disabled={busy} onChange={e=>{setAccountId(e.target.value);setOpening('0.00')}}>{cashAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name}{openSessions.some(s=>s.cash_account_id===a.cash_account_id)?' · ABIERTA':''}</option>)}</select>}<span className={`cash-shift-status ${session?'open':'closed'}`}>{session?'ABIERTA':'SIN APERTURA'}</span></div></div>
      {!session?<div className="cash-shift-open"><label>Caja<select value={accountId} onChange={e=>{setAccountId(e.target.value);setOpening('0.00')}}>{cashAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name}</option>)}</select></label><label>Efectivo inicial<input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button type="button" disabled={busy||!cashAccounts.length} onClick={openRegister}>Abrir caja</button></div>:<>
        <div className="cash-shift-summary"><article><small>Apertura</small><strong>{money(session.opening_balance)}</strong></article><article><small>Entradas</small><strong>+ {money(summary.income)}</strong></article><article><small>Salidas</small><strong>- {money(summary.expense)}</strong></article><article className="expected"><small>Efectivo esperado</small><strong>{money(summary.expected)}</strong></article></div>
        <div className="cash-shift-actions"><span>{activeAccount?.name||'Caja'} · abierta {fmtTime(session.opened_at)}{lastCut?` · último corte ${fmtTime(lastCut.cut_at)}`:''}</span><div><button type="button" className="secondary" disabled={busy} onClick={makeCut}>Hacer corte</button><button type="button" className="close" disabled={busy} onClick={openCloseDialog}>Cerrar caja</button></div></div>
      </>}
      {message&&<p className="cash-shift-message">{message}</p>}
    </section>

    {history.length>0&&<details className="cash-shift-history"><summary><span><strong>Historial de turnos</strong><small>{history.length} turno{history.length===1?'':'s'} registrado{history.length===1?'':'s'}</small></span><b>Ver historial</b></summary><div className="cash-history-list">{history.map(h=>{const account=accounts.find(a=>a.cash_account_id===h.cash_account_id),cuts=cutsBySession[h.id]||[],stats=historyStats[h.id]||{income:0,expense:0},diff=Number(h.difference||0),expected=h.status==='OPEN'?Number(h.opening_balance||0)+stats.income-stats.expense:Number(h.closing_expected||0);return <article key={h.id}><div className="cash-history-main"><div><strong>{fmtDate(h.business_date)} · {account?.name||'Caja'}</strong><small>{h.status==='OPEN'?`Abierta ${fmtTime(h.opened_at)}`:`Cerrada ${fmtTime(h.closed_at)}`}{cuts.length?` · ${cuts.length} corte${cuts.length===1?'':'s'}`:''}</small></div><div className="cash-history-head-actions"><span className={`cash-history-status ${h.status==='OPEN'?'open':'closed'}`}>{h.status==='OPEN'?'ABIERTA':'CERRADA'}</span><button type="button" onClick={()=>setReportSession(h)}>Ver reporte</button></div></div><div className="cash-history-values"><span><small>Apertura</small><b>{money(h.opening_balance)}</b></span><span><small>Entradas</small><b>{money(stats.income)}</b></span><span><small>Salidas</small><b>{money(stats.expense)}</b></span><span><small>Esperado</small><b>{money(expected)}</b></span><span><small>Contado</small><b>{h.status==='OPEN'?'—':money(h.closing_counted)}</b></span><span className={h.status==='OPEN'?'':Math.abs(diff)<.005?'ok':diff>0?'plus':'minus'}><small>Diferencia</small><b>{h.status==='OPEN'?'—':money(diff)}</b></span></div>{h.notes&&<p className="cash-history-note">Observación: {h.notes}</p>}{cuts.length>0&&<details className="cash-history-cuts"><summary>Ver cortes ({cuts.length})</summary><div>{cuts.map((c,i)=><p key={`${h.id}-${c.cut_at}-${i}`}><span>{fmtTime(c.cut_at)}</span><span>Entradas {money(c.income_total)}</span><span>Salidas {money(c.expense_total)}</span><strong>Esperado {money(c.expected_balance)}</strong></p>)}</div></details>}</article>})}</div></details>}

    {closeDialog.open&&<div className="cash-close-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setCloseDialog({open:false,expected:0,counted:'',notes:''})}}><section className="cash-close-modal" role="dialog" aria-modal="true" aria-labelledby="cash-close-title"><div className="cash-close-head"><div><p className="form-kicker">CIERRE DE CAJA</p><h3 id="cash-close-title">Confirmar cierre</h3><small>{activeAccount?.name||'Caja principal'}</small></div><button type="button" className="cash-close-x" disabled={busy} onClick={()=>setCloseDialog({open:false,expected:0,counted:'',notes:''})}>×</button></div><div className="cash-close-summary"><article><small>Efectivo esperado</small><strong>{money(closeDialog.expected)}</strong></article><article><small>Efectivo contado</small><strong>{money(closeDialog.counted)}</strong></article><article className={Math.abs(closeDifference)<.005?'ok':closeDifference>0?'plus':'minus'}><small>Diferencia</small><strong>{money(closeDifference)}</strong><em>{closeDifferenceLabel}</em></article></div><label className="cash-close-field">Efectivo contado físicamente<input autoFocus type="number" min="0" step="0.01" value={closeDialog.counted} onChange={e=>setCloseDialog(v=>({...v,counted:e.target.value}))}/></label><label className="cash-close-field">Observación <span>{Math.abs(closeDifference)>=.01?'(obligatoria por diferencia)':'(opcional)'}</span><textarea rows="3" maxLength="300" value={closeDialog.notes} onChange={e=>setCloseDialog(v=>({...v,notes:e.target.value}))} placeholder="Ej. cambio dejado para mañana, diferencia revisada, etc."/></label><div className="cash-close-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setCloseDialog({open:false,expected:0,counted:'',notes:''})}>Cancelar</button><button type="button" className="confirm" disabled={busy||!Number.isFinite(Number(closeDialog.counted))||Number(closeDialog.counted)<0} onClick={confirmClose}>{busy?'Cerrando…':'Confirmar cierre'}</button></div></section></div>}
    {reportSession&&<CashShiftReport session={reportSession} company={company} supabase={supabase} account={accounts.find(a=>a.cash_account_id===reportSession.cash_account_id)} onClose={()=>setReportSession(null)}/>} 
  </>
}
