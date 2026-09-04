import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
const today=()=>{const d=new Date();return iso(d)}
const monthRange=()=>{const d=new Date();return {start:iso(new Date(d.getFullYear(),d.getMonth(),1)),end:iso(new Date(d.getFullYear(),d.getMonth()+1,0))}}
const weekRange=()=>{const d=new Date(),day=d.getDay()||7;const start=new Date(d);start.setDate(d.getDate()-day+1);const end=new Date(start);end.setDate(start.getDate()+6);return {start:iso(start),end:iso(end)}}

export default function FinancialReportsCenter({company,supabase}){
  const initial=monthRange()
  const [range,setRange]=useState(initial)
  const [preset,setPreset]=useState('month')
  const [data,setData]=useState(null)
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)

  const load=async()=>{
    if(!range.start||!range.end)return
    setLoading(true);setMessage('')
    const {data:row,error}=await supabase.rpc('financial_dashboard_snapshot',{p_company:company.id,p_start:range.start,p_end:range.end})
    if(error)setMessage(error.message)
    else setData(row||{})
    setLoading(false)
  }
  useEffect(()=>{load()},[company.id,range.start,range.end])

  const setQuickRange=type=>{
    setPreset(type)
    if(type==='today'){const d=today();setRange({start:d,end:d})}
    if(type==='week')setRange(weekRange())
    if(type==='month')setRange(monthRange())
  }

  const flowStatus=useMemo(()=>Number(data?.net_cash||0)>=0?'Positivo':'Negativo',[data?.net_cash])
  const exportCsv=()=>{
    if(!data)return
    const rows=[
      ['Indicador','Valor'],
      ['Desde',data.start_date],['Hasta',data.end_date],
      ['Disponible total',data.cash_total],['Caja',data.cash_available],['Banco',data.bank_available],
      ['Entradas',data.cash_in],['Salidas',data.cash_out],['Flujo neto',data.net_cash],
      ['Cuentas por cobrar',data.receivables],['Cuentas por pagar',data.payables],
      ['Anticipos pendientes',data.pending_advances],['Compras del período',data.purchases_period],['Gastos del período',data.expenses_period],
      ['DTE producción aceptados',data.accepted_dte_total],
    ]
    const blob=new Blob([rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(',')).join('\n')],{type:'text/csv;charset=utf-8'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`finanzas-${range.start}-${range.end}.csv`;a.click();URL.revokeObjectURL(a.href)
  }

  return <section className="clients-module financial-executive">
    <div className="clients-titlebar"><div><p className="form-kicker">DIRECCIÓN FINANCIERA</p><h2>Resumen financiero conciliado</h2><p>Caja, bancos, CxC, CxP, compras, gastos, anticipos y DTE desde movimientos reales.</p></div><button type="button" onClick={exportCsv} disabled={!data||loading}>Exportar CSV</button></div>

    <section className="panel finance-period-panel">
      <div className="finance-quick-ranges">
        <button type="button" className={preset==='today'?'active':''} onClick={()=>setQuickRange('today')}>Hoy</button>
        <button type="button" className={preset==='week'?'active':''} onClick={()=>setQuickRange('week')}>Semana</button>
        <button type="button" className={preset==='month'?'active':''} onClick={()=>setQuickRange('month')}>Mes</button>
        <button type="button" className={preset==='custom'?'active':''} onClick={()=>setPreset('custom')}>Rango</button>
      </div>
      <div className="finance-date-range">
        <label className="field"><span>Desde</span><input type="date" value={range.start} onChange={e=>{setPreset('custom');setRange(v=>({...v,start:e.target.value}))}}/></label>
        <label className="field"><span>Hasta</span><input type="date" value={range.end} onChange={e=>{setPreset('custom');setRange(v=>({...v,end:e.target.value}))}}/></label>
        <button type="button" onClick={load} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button>
      </div>
    </section>

    {message&&<p className="feedback error">{message}</p>}
    {data&&<>
      <div className="finance-exec-grid">
        <article className="metric-card finance-hero-card"><span>Disponible ahora</span><strong>{money(data.cash_total)}</strong><small>Caja {money(data.cash_available)} · Banco {money(data.bank_available)}</small></article>
        <article className="metric-card"><span>Entradas del período</span><strong>{money(data.cash_in)}</strong><small>Cobros {money(data.customer_collections)} · Anticipos {money(data.customer_advances)}</small></article>
        <article className="metric-card"><span>Salidas del período</span><strong>{money(data.cash_out)}</strong><small>Compras {money(data.purchase_cash_out)} · Gastos {money(data.expense_cash_out)}</small></article>
        <article className={`metric-card ${Number(data.net_cash)<0?'finance-negative':'finance-positive'}`}><span>Resultado de caja</span><strong>{money(data.net_cash)}</strong><small>{flowStatus} · entradas menos salidas</small></article>
        <article className="metric-card"><span>Cuentas por cobrar</span><strong>{money(data.receivables)}</strong><small>{data.open_receivables||0} abiertas · {money(data.receivables_overdue)} vencido</small></article>
        <article className="metric-card"><span>Cuentas por pagar</span><strong>{money(data.payables)}</strong><small>{data.open_payables||0} abiertas · {money(data.payables_overdue)} vencido</small></article>
      </div>

      <div className="module-grid two-column finance-analysis-grid">
        <section className="panel"><div className="panel-heading"><div><p className="form-kicker">MOVIMIENTO REAL</p><h3>Qué entró y qué salió</h3></div></div><div className="finance-statement">
          <div><span>Cobros de clientes</span><strong>{money(data.customer_collections)}</strong></div>
          <div><span>Anticipos recibidos</span><strong>{money(data.customer_advances)}</strong></div>
          <div className="subtotal"><span>Total entradas</span><strong>{money(data.cash_in)}</strong></div>
          <div><span>Compras pagadas directo</span><strong>- {money(data.purchase_cash_out)}</strong></div>
          <div><span>Gastos operativos pagados</span><strong>- {money(data.expense_cash_out)}</strong></div>
          <div><span>Pagos a proveedores / CxP</span><strong>- {money(data.supplier_payment_cash_out)}</strong></div>
          <div className="subtotal"><span>Total salidas</span><strong>- {money(data.cash_out)}</strong></div>
          <div className="total"><span>Flujo neto</span><strong>{money(data.net_cash)}</strong></div>
        </div></section>

        <section className="panel"><div className="panel-heading"><div><p className="form-kicker">COMPROMISOS</p><h3>Lo que queda pendiente</h3></div></div><div className="finance-statement">
          <div><span>Clientes por cobrar</span><strong>{money(data.receivables)}</strong></div>
          <div><span>De ese saldo, vencido</span><strong>{money(data.receivables_overdue)}</strong></div>
          <div><span>Proveedores por pagar</span><strong>{money(data.payables)}</strong></div>
          <div><span>De ese saldo, vencido</span><strong>{money(data.payables_overdue)}</strong></div>
          <div><span>Anticipos aún sin aplicar</span><strong>{money(data.pending_advances)}</strong></div>
        </div></section>
      </div>

      <div className="module-grid two-column finance-analysis-grid">
        <section className="panel"><div className="panel-heading"><div><p className="form-kicker">ACTIVIDAD</p><h3>Compras y gastos del período</h3></div></div><div className="finance-statement"><div><span>Compras registradas</span><strong>{money(data.purchases_period)}</strong></div><div><span>Gastos registrados</span><strong>{money(data.expenses_period)}</strong></div><div className="dte-note"><strong>Importante:</strong> estos valores son análisis operativo. No se restan otra vez al flujo porque los pagos reales ya están en Caja/Banco.</div></div></section>
        <section className="panel"><div className="panel-heading"><div><p className="form-kicker">FACTURACIÓN REAL</p><h3>DTE aceptados en producción</h3></div></div><div className="finance-statement"><div><span>DTE procesados</span><strong>{data.accepted_dte_count||0}</strong></div><div><span>Total fiscal aceptado</span><strong>{money(data.accepted_dte_total)}</strong></div><div className="dte-note">Los DTE del ambiente de pruebas 00 no se consideran ventas reales en este resumen.</div></div></section>
      </div>

      <div className="dte-note finance-integrity"><strong>Control de integridad:</strong> {data.integrity_note}</div>
    </>}
  </section>
}
