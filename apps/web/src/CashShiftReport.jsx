import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const fmtDateTime=v=>v?new Date(v).toLocaleString('es-SV'):'—'
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))

export default function CashShiftReport({session,company,supabase,account,onClose}){
  const [moves,setMoves]=useState([])
  const [cuts,setCuts]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let active=true
    const run=async()=>{
      setLoading(true);setError('')
      const [m,c]=await Promise.all([
        supabase.from('cash_movements').select('id,movement_date,movement_type,source_type,concept,amount,reference').eq('company_id',company.id).eq('cash_register_session_id',session.id).order('movement_date',{ascending:true}),
        supabase.from('cash_register_cuts').select('cut_at,expected_balance,income_total,expense_total,movement_count,notes').eq('session_id',session.id).order('cut_at',{ascending:true})
      ])
      if(!active)return
      const e=m.error||c.error
      if(e)setError(e.message);else{setMoves(m.data||[]);setCuts(c.data||[])}
      setLoading(false)
    }
    run();return()=>{active=false}
  },[session.id,company.id,supabase])

  const totals=useMemo(()=>{
    const income=moves.filter(x=>['INCOME','TRANSFER_IN'].includes(x.movement_type)).reduce((s,x)=>s+Number(x.amount||0),0)
    const expense=moves.filter(x=>['EXPENSE','TRANSFER_OUT'].includes(x.movement_type)).reduce((s,x)=>s+Number(x.amount||0),0)
    return {income,expense}
  },[moves])

  const printReport=()=>{
    const expected=Number(session.closing_expected??Number(session.opening_balance||0)+totals.income-totals.expense)
    const counted=session.closing_counted==null?'—':money(session.closing_counted)
    const difference=session.difference==null?'—':money(session.difference)
    const rows=moves.map(m=>`<tr><td>${esc(fmtDateTime(m.movement_date))}</td><td>${esc(m.concept||m.source_type||'Movimiento')}</td><td>${esc(m.movement_type)}</td><td style="text-align:right">${esc(money(m.amount))}</td></tr>`).join('')||'<tr><td colspan="4">Sin movimientos</td></tr>'
    const cutRows=cuts.map(c=>`<tr><td>${esc(fmtDateTime(c.cut_at))}</td><td style="text-align:right">${esc(money(c.income_total))}</td><td style="text-align:right">${esc(money(c.expense_total))}</td><td style="text-align:right">${esc(money(c.expected_balance))}</td></tr>`).join('')||'<tr><td colspan="4">Sin cortes</td></tr>'
    const w=window.open('','_blank','width=900,height=700')
    if(!w)return
    w.document.write(`<!doctype html><html><head><title>Reporte de cierre de caja</title><style>body{font-family:Arial,sans-serif;color:#222;padding:28px}h1{margin:0 0 4px}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.card{border:1px solid #ddd;border-radius:8px;padding:10px}.card small{display:block;color:#666}.card b{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:12px}h2{margin-top:24px;font-size:16px}.note{padding:10px;border:1px solid #ddd;border-radius:8px;background:#fafafa}@media print{button{display:none}body{padding:0}}</style></head><body><h1>Reporte de cierre de caja</h1><div class="muted">${esc(company?.name||'IDEALO SV')} · ${esc(account?.name||'Caja')}</div><div class="muted">Apertura: ${esc(fmtDateTime(session.opened_at))} · Cierre: ${esc(fmtDateTime(session.closed_at))}</div><div class="grid"><div class="card"><small>Apertura</small><b>${esc(money(session.opening_balance))}</b></div><div class="card"><small>Entradas</small><b>${esc(money(totals.income))}</b></div><div class="card"><small>Salidas</small><b>${esc(money(totals.expense))}</b></div><div class="card"><small>Esperado</small><b>${esc(money(expected))}</b></div><div class="card"><small>Contado</small><b>${esc(counted)}</b></div><div class="card"><small>Diferencia</small><b>${esc(difference)}</b></div></div><h2>Movimientos del turno</h2><table><thead><tr><th>Fecha/hora</th><th>Concepto</th><th>Tipo</th><th style="text-align:right">Monto</th></tr></thead><tbody>${rows}</tbody></table><h2>Cortes realizados</h2><table><thead><tr><th>Hora</th><th style="text-align:right">Entradas</th><th style="text-align:right">Salidas</th><th style="text-align:right">Esperado</th></tr></thead><tbody>${cutRows}</tbody></table>${session.notes?`<h2>Observación</h2><div class="note">${esc(session.notes)}</div>`:''}<p class="muted" style="margin-top:24px">Generado por IDEALO SV</p><button onclick="window.print()">Imprimir / Guardar PDF</button></body></html>`)
    w.document.close();w.focus();setTimeout(()=>w.print(),250)
  }

  return <div className="cash-report-backdrop" role="dialog" aria-modal="true">
    <section className="cash-report-modal">
      <div className="cash-report-head"><div><p className="form-kicker">REPORTE DE CAJA</p><h3>{account?.name||'Caja'} · {session.status==='CLOSED'?'Turno cerrado':'Turno abierto'}</h3></div><button type="button" onClick={onClose}>×</button></div>
      {error&&<p className="feedback error">{error}</p>}
      {loading?<p>Cargando reporte…</p>:<>
        <div className="cash-report-summary"><span><small>Apertura</small><b>{money(session.opening_balance)}</b></span><span><small>Entradas</small><b>{money(totals.income)}</b></span><span><small>Salidas</small><b>{money(totals.expense)}</b></span><span><small>Esperado</small><b>{money(session.closing_expected??Number(session.opening_balance||0)+totals.income-totals.expense)}</b></span><span><small>Contado</small><b>{session.closing_counted==null?'—':money(session.closing_counted)}</b></span><span><small>Diferencia</small><b>{session.difference==null?'—':money(session.difference)}</b></span></div>
        <div className="cash-report-table"><h4>Movimientos del turno</h4><div className="cash-report-rows">{moves.length?moves.map(m=><div key={m.id}><span>{fmtDateTime(m.movement_date)}</span><span>{m.concept||m.source_type||'Movimiento'}</span><span>{m.movement_type}</span><b>{money(m.amount)}</b></div>):<p>Sin movimientos.</p>}</div></div>
        {session.notes&&<p className="cash-report-note"><b>Observación:</b> {session.notes}</p>}
      </>}
      <div className="cash-report-actions"><button type="button" className="secondary" onClick={onClose}>Cerrar</button><button type="button" disabled={loading||!!error} onClick={printReport}>Imprimir / PDF</button></div>
    </section>
  </div>
}
