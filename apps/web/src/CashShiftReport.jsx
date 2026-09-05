import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const fmtDateTime=v=>v?new Date(v).toLocaleString('es-SV',{dateStyle:'short',timeStyle:'medium'}):'—'
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))
const movementLabel=v=>({INCOME:'Entrada',TRANSFER_IN:'Transferencia recibida',EXPENSE:'Salida',TRANSFER_OUT:'Transferencia enviada'}[v]||v||'Movimiento')

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
    const countedValue=session.closing_counted==null?null:Number(session.closing_counted)
    const differenceValue=session.difference==null?null:Number(session.difference)
    const counted=countedValue==null?'—':money(countedValue)
    const difference=differenceValue==null?'—':money(differenceValue)
    const differenceClass=differenceValue==null?'neutral':differenceValue<0?'negative':differenceValue>0?'positive':'balanced'
    const generatedAt=fmtDateTime(new Date())
    const companyName=company?.name||'IDEALO SV'
    const accountName=account?.name||'Caja'
    const status=session.status==='CLOSED'?'CERRADO':'ABIERTO'

    const rows=moves.map(m=>`<tr>
      <td>${esc(fmtDateTime(m.movement_date))}</td>
      <td><strong>${esc(m.concept||m.source_type||'Movimiento')}</strong>${m.reference?`<small>${esc(m.reference)}</small>`:''}</td>
      <td><span class="type-pill">${esc(movementLabel(m.movement_type))}</span></td>
      <td class="amount">${esc(money(m.amount))}</td>
    </tr>`).join('')||'<tr><td colspan="4" class="empty">No se registraron movimientos durante este turno.</td></tr>'

    const cutRows=cuts.map(c=>`<tr>
      <td>${esc(fmtDateTime(c.cut_at))}</td>
      <td class="amount">${esc(money(c.income_total))}</td>
      <td class="amount">${esc(money(c.expense_total))}</td>
      <td class="amount"><strong>${esc(money(c.expected_balance))}</strong></td>
    </tr>`).join('')||'<tr><td colspan="4" class="empty">No se realizaron cortes parciales.</td></tr>'

    const w=window.open('','_blank','width=980,height=760')
    if(!w)return
    w.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Cierre de caja - ${esc(accountName)}</title>
<style>
  :root{--ink:#151515;--muted:#6b7280;--line:#e5e7eb;--soft:#f7f7f8;--orange:#f47b20;--orange-soft:#fff4eb;--green:#18794e;--green-soft:#edf9f2;--red:#b42318;--red-soft:#fff1f0}
  *{box-sizing:border-box}
  @page{size:Letter;margin:12mm 12mm 13mm}
  body{margin:0;background:#fff;color:var(--ink);font-family:Inter,Segoe UI,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .report{max-width:816px;margin:0 auto;padding:4px 2px 0}
  .topbar{height:7px;background:linear-gradient(90deg,var(--orange) 0 36%,#171717 36% 100%);border-radius:7px 7px 0 0;margin-bottom:18px}
  .header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:16px}
  .brand{font-size:12px;font-weight:900;letter-spacing:.16em;color:var(--orange);margin:0 0 7px;text-transform:uppercase}
  h1{font-size:25px;line-height:1.08;margin:0 0 8px;letter-spacing:-.5px}
  .sub{font-size:12px;color:var(--muted);line-height:1.65}
  .status{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #d7d7d7;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em}
  .status:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--orange)}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;margin:16px 0 18px;padding:12px 14px;background:var(--soft);border:1px solid var(--line);border-radius:10px}
  .meta span{font-size:10px;color:var(--muted);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
  .meta b{font-size:12px;font-weight:700}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:0 0 22px}
  .card{border:1px solid var(--line);border-radius:11px;padding:12px 13px;min-height:69px;background:#fff}
  .card small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.055em;margin-bottom:6px}
  .card b{font-size:18px;letter-spacing:-.25px}
  .card.highlight{background:var(--orange-soft);border-color:#ffd8bc}
  .card.balanced{background:var(--green-soft);border-color:#bfe7cf}.card.balanced b{color:var(--green)}
  .card.positive{background:var(--green-soft);border-color:#bfe7cf}.card.positive b{color:var(--green)}
  .card.negative{background:var(--red-soft);border-color:#f5c2bd}.card.negative b{color:var(--red)}
  .card.neutral{background:var(--soft)}
  .section{margin-top:20px;break-inside:avoid}
  .section-title{display:flex;justify-content:space-between;align-items:end;margin:0 0 8px}
  h2{font-size:13px;margin:0;text-transform:uppercase;letter-spacing:.055em}
  .count{font-size:10px;color:var(--muted)}
  .table-wrap{border:1px solid var(--line);border-radius:10px;overflow:hidden}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  thead{background:#191919;color:#fff}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.055em;padding:9px 10px;text-align:left}
  td{padding:9px 10px;border-bottom:1px solid var(--line);font-size:10px;vertical-align:top;line-height:1.35}
  tbody tr:last-child td{border-bottom:0}
  td small{display:block;color:var(--muted);margin-top:2px;font-size:9px}
  .amount{text-align:right;font-variant-numeric:tabular-nums}
  .type-pill{display:inline-block;background:var(--orange-soft);color:#9a4a0c;border:1px solid #ffd9bc;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:700;white-space:nowrap}
  .empty{text-align:center;color:var(--muted);padding:17px}
  .note{margin-top:18px;padding:12px 14px;border-left:4px solid var(--orange);background:var(--orange-soft);border-radius:0 9px 9px 0;font-size:10px;line-height:1.55}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:55px;margin:44px 16px 18px}
  .signature{border-top:1px solid #9ca3af;padding-top:7px;text-align:center;font-size:9px;color:var(--muted)}
  .footer{display:flex;justify-content:space-between;gap:15px;border-top:1px solid var(--line);padding-top:9px;margin-top:16px;color:var(--muted);font-size:8px}
  .print-action{position:fixed;right:22px;bottom:22px;border:0;border-radius:9px;background:#171717;color:#fff;font-weight:700;padding:11px 15px;cursor:pointer;box-shadow:0 10px 25px #0002}
  @media print{.print-action{display:none}.report{max-width:none}.section{break-inside:auto}.table-wrap{break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}.footer{position:relative}}
</style>
</head>
<body>
<main class="report">
  <div class="topbar"></div>
  <header class="header">
    <div>
      <p class="brand">${esc(companyName)}</p>
      <h1>Reporte de cierre de caja</h1>
      <div class="sub">Resumen financiero y trazabilidad del turno de caja.</div>
    </div>
    <span class="status">${esc(status)}</span>
  </header>

  <section class="meta">
    <div><span>Caja</span><b>${esc(accountName)}</b></div>
    <div><span>Estado del turno</span><b>${esc(session.status==='CLOSED'?'Turno cerrado':'Turno abierto')}</b></div>
    <div><span>Apertura</span><b>${esc(fmtDateTime(session.opened_at))}</b></div>
    <div><span>Cierre</span><b>${esc(fmtDateTime(session.closed_at))}</b></div>
  </section>

  <section class="summary">
    <div class="card"><small>Apertura</small><b>${esc(money(session.opening_balance))}</b></div>
    <div class="card"><small>Entradas</small><b>${esc(money(totals.income))}</b></div>
    <div class="card"><small>Salidas</small><b>${esc(money(totals.expense))}</b></div>
    <div class="card"><small>Esperado</small><b>${esc(money(expected))}</b></div>
    <div class="card highlight"><small>Contado</small><b>${esc(counted)}</b></div>
    <div class="card ${differenceClass}"><small>Diferencia</small><b>${esc(difference)}</b></div>
  </section>

  <section class="section">
    <div class="section-title"><h2>Movimientos del turno</h2><span class="count">${moves.length} registro${moves.length===1?'':'s'}</span></div>
    <div class="table-wrap"><table>
      <colgroup><col style="width:22%"><col style="width:42%"><col style="width:20%"><col style="width:16%"></colgroup>
      <thead><tr><th>Fecha / hora</th><th>Concepto</th><th>Tipo</th><th class="amount">Monto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>

  <section class="section">
    <div class="section-title"><h2>Cortes realizados</h2><span class="count">${cuts.length} corte${cuts.length===1?'':'s'}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha / hora</th><th class="amount">Entradas</th><th class="amount">Salidas</th><th class="amount">Esperado</th></tr></thead>
      <tbody>${cutRows}</tbody>
    </table></div>
  </section>

  ${session.notes?`<div class="note"><strong>Observaciones del cierre</strong><br>${esc(session.notes)}</div>`:''}

  <section class="signatures">
    <div class="signature">Firma de cajero / responsable</div>
    <div class="signature">Firma de revisión / autorización</div>
  </section>

  <footer class="footer">
    <span>Generado por IDEALO SV</span>
    <span>${esc(generatedAt)}</span>
  </footer>
</main>
<button class="print-action" onclick="window.print()">Imprimir / Guardar PDF</button>
</body></html>`)
    w.document.close();w.focus();setTimeout(()=>w.print(),300)
  }

  return <div className="cash-report-backdrop" role="dialog" aria-modal="true">
    <section className="cash-report-modal">
      <div className="cash-report-head"><div><p className="form-kicker">REPORTE DE CAJA</p><h3>{account?.name||'Caja'} · {session.status==='CLOSED'?'Turno cerrado':'Turno abierto'}</h3></div><button type="button" onClick={onClose}>×</button></div>
      {error&&<p className="feedback error">{error}</p>}
      {loading?<p>Cargando reporte…</p>:<>
        <div className="cash-report-summary"><span><small>Apertura</small><b>{money(session.opening_balance)}</b></span><span><small>Entradas</small><b>{money(totals.income)}</b></span><span><small>Salidas</small><b>{money(totals.expense)}</b></span><span><small>Esperado</small><b>{money(session.closing_expected??Number(session.opening_balance||0)+totals.income-totals.expense)}</b></span><span><small>Contado</small><b>{session.closing_counted==null?'—':money(session.closing_counted)}</b></span><span><small>Diferencia</small><b>{session.difference==null?'—':money(session.difference)}</b></span></div>
        <div className="cash-report-table"><h4>Movimientos del turno</h4><div className="cash-report-rows">{moves.length?moves.map(m=><div key={m.id}><span>{fmtDateTime(m.movement_date)}</span><span>{m.concept||m.source_type||'Movimiento'}</span><span>{movementLabel(m.movement_type)}</span><b>{money(m.amount)}</b></div>):<p>Sin movimientos.</p>}</div></div>
        {session.notes&&<p className="cash-report-note"><b>Observación:</b> {session.notes}</p>}
      </>}
      <div className="cash-report-actions"><button type="button" className="secondary" onClick={onClose}>Cerrar</button><button type="button" disabled={loading||!!error} onClick={printReport}>Imprimir / PDF</button></div>
    </section>
  </div>
}
