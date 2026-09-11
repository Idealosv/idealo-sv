import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-shift-control.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const fmt=v=>v?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—'
const n=v=>Number(v||0)
const orderType={table:'Mesa',takeaway:'Para llevar',delivery:'Delivery'}
const statusLabel={open:'Abierto',sent:'Enviado',preparing:'Preparando',ready:'Listo',served:'Servido'}

export default function IdealoBarShiftControl({company,supabase,access}){
 const companyId=company?.id
 const permissions=Array.isArray(access?.permissions)?access.permissions:[]
 const can=p=>permissions.includes('*')||permissions.includes(p)
 const canHandoff=can('cash.cut')||can('admin.manage')
 const canRepair=can('admin.manage')
 const [snapshot,setSnapshot]=useState(null)
 const [handoffs,setHandoffs]=useState([])
 const [note,setNote]=useState('')
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  const [a,b]=await Promise.all([
   supabase.rpc('bar_shift_snapshot',{p_company_id:companyId}),
   supabase.from('bar_shift_handoffs').select('id,note,snapshot,created_by,created_at,cash_register_session_id').eq('company_id',companyId).order('created_at',{ascending:false}).limit(20),
  ])
  if(a.error)setError(a.error.message)
  else if(b.error)setError(b.error.message)
  else{setSnapshot(a.data||{});setHandoffs(b.data||[])}
  setLoading(false)
 },[companyId,supabase])
 useEffect(()=>{load()},[load])

 const run=async(fn,msg)=>{setWorking(true);setError('');setNotice('');try{const result=await fn();setNotice(typeof msg==='function'?msg(result):msg);await load();return result}catch(e){setError(e.message||String(e));return null}finally{setWorking(false)}}
 const saveHandoff=()=>run(async()=>{if(note.trim().length<3)throw new Error('Escribe una nota breve para entregar el turno.');const {data,error:e}=await supabase.rpc('bar_create_shift_handoff',{p_company_id:companyId,p_note:note.trim()});if(e)throw e;setNote('');return data},'Entrega de turno registrada con fotografía del estado del negocio.')
 const repair=()=>run(async()=>{if(!window.confirm('La reparación segura solo corrige estados deducibles de mesas, divisiones cerradas, comandas faltantes y ranking. ¿Continuar?'))throw new Error('Reparación cancelada.');const {data,error:e}=await supabase.rpc('bar_safe_repair',{p_company_id:companyId});if(e)throw e;return data},r=>`Revisión aplicada: ${n(r?.tables_to_available)+n(r?.tables_to_occupied)+n(r?.tables_to_bill)} mesa(s), ${n(r?.splits_closed)} división(es), ${n(r?.print_jobs_recovered)} comanda(s).`)

 const session=snapshot?.cash_session
 const payments=snapshot?.payments||{}
 const expectedCash=useMemo(()=>session?n(session.opening_balance)+n(session.cash_collected)+n(session.manual_income)-n(session.manual_expense):0,[session])
 const openOrders=Array.isArray(snapshot?.open_order_list)?snapshot.open_order_list:[]
 const reservations=Array.isArray(snapshot?.upcoming_reservations)?snapshot.upcoming_reservations:[]
 const attention=n(snapshot?.pending_cash_postings)+n(snapshot?.pending_dte)+n(snapshot?.stale_print_jobs)

 if(loading)return <section className="bar-shift"><div className="bar-shift-loading">Preparando control del turno…</div></section>

 return <section className="bar-shift">
  <header className="bar-shift-head"><div><span>TURNO EN VIVO</span><h2>Entrega, control y cierre</h2><p>Una sola pantalla para saber si el negocio puede cambiar de responsable o cerrar sin dejar pendientes.</p></div><button type="button" onClick={load} disabled={working}>↻ Actualizar</button></header>
  {error&&<div className="bar-shift-alert error">{error}</div>}
  {notice&&<div className="bar-shift-alert ok">✓ {notice}</div>}

  <div className={`bar-shift-ready ${snapshot?.cash_close_ready?'ok':'warn'}`}>
   <div><small>ESTADO PARA CIERRE</small><strong>{snapshot?.cash_close_ready?'OPERACIÓN DESPEJADA':'HAY PENDIENTES'}</strong><span>{snapshot?.cash_close_ready?'No hay pedidos ni cobros pendientes que bloqueen el cierre de caja.':'Resuelve pedidos, estaciones o conciliaciones antes de cerrar caja.'}</span></div>
   <b>{snapshot?.cash_close_ready?'✓':'!'}</b>
  </div>

  <div className="bar-shift-kpis">
   <article><small>VENTAS HOY</small><strong>{money.format(n(snapshot?.today_sales))}</strong><span>Propinas {money.format(n(snapshot?.today_tips))}</span></article>
   <article className={n(snapshot?.open_orders)?'warn':''}><small>PEDIDOS ABIERTOS</small><strong>{n(snapshot?.open_orders)}</strong><span>{n(snapshot?.station_pending)} en Cocina/Barra</span></article>
   <article className={attention?'warn':''}><small>ATENCIÓN</small><strong>{attention}</strong><span>{n(snapshot?.pending_cash_postings)} conciliación · {n(snapshot?.pending_dte)} DTE</span></article>
   <article className={n(snapshot?.low_stock_items)?'warn':''}><small>STOCK BAJO</small><strong>{n(snapshot?.low_stock_items)}</strong><span>{n(snapshot?.stale_print_jobs)} comanda(s) atrasada(s)</span></article>
  </div>

  <div className="bar-shift-grid">
   <article className="bar-shift-card">
    <div className="bar-shift-card-head"><div><small>CAJA</small><h3>{session?'Turno abierto':'Caja cerrada'}</h3></div><b className={session?'good':'neutral'}>{session?'ABIERTA':'CERRADA'}</b></div>
    {session?<><div className="bar-shift-money"><span>Fondo inicial<b>{money.format(n(session.opening_balance))}</b></span><span>Efectivo cobrado<b>{money.format(n(session.cash_collected))}</b></span><span>Movimientos manuales<b>{money.format(n(session.manual_income)-n(session.manual_expense))}</b></span><span>Efectivo esperado<b>{money.format(expectedCash)}</b></span></div><p>Abierta {fmt(session.opened_at)} · fecha de negocio {session.business_date}</p></>:<p>No existe una sesión de caja abierta en este momento.</p>}
   </article>

   <article className="bar-shift-card">
    <div className="bar-shift-card-head"><div><small>COBROS DEL DÍA</small><h3>Métodos de pago</h3></div><b>{money.format(n(payments.total))}</b></div>
    <div className="bar-shift-money"><span>Efectivo<b>{money.format(n(payments.cash))}</b></span><span>Tarjeta<b>{money.format(n(payments.card))}</b></span><span>Transferencia<b>{money.format(n(payments.transfer))}</b></span><span>Otros<b>{money.format(n(payments.other))}</b></span></div>
   </article>

   <article className="bar-shift-card wide">
    <div className="bar-shift-card-head"><div><small>OPERACIÓN</small><h3>Pedidos que deben quedar explicados</h3></div><b>{openOrders.length}</b></div>
    {openOrders.length?<div className="bar-shift-list">{openOrders.map(o=><div key={o.id}><span><b>{o.order_code}</b><small>{orderType[o.type]||o.type} · {statusLabel[o.status]||o.status} · abierto {fmt(o.opened_at)}</small></span><strong>{money.format(n(o.total))}</strong></div>)}</div>:<div className="bar-shift-empty">No hay pedidos abiertos.</div>}
   </article>

   <article className="bar-shift-card wide">
    <div className="bar-shift-card-head"><div><small>PRÓXIMAS 6 HORAS</small><h3>Reservas</h3></div><b>{reservations.length}</b></div>
    {reservations.length?<div className="bar-shift-list">{reservations.map(r=><div key={r.id}><span><b>{r.customer_name}</b><small>{r.party_size} persona(s) · {fmt(r.reserved_for)}</small></span><strong>{String(r.status).toUpperCase()}</strong></div>)}</div>:<div className="bar-shift-empty">No hay reservas próximas.</div>}
   </article>
  </div>

  {canHandoff&&<article className="bar-shift-handoff"><div><small>ENTREGA DE TURNO</small><h3>Deja constancia antes de cambiar de responsable</h3><p>La nota se guarda junto con ventas, caja, pedidos, pendientes y reservas exactamente como están en ese momento.</p></div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej.: Caja cuadrada. Mesa 7 espera postre. Pedido delivery #… sigue en ruta."/><button type="button" onClick={saveHandoff} disabled={working||note.trim().length<3}>Registrar entrega de turno</button></article>}

  <div className="bar-shift-bottom">
   <article className="bar-shift-card"><div className="bar-shift-card-head"><div><small>HISTORIAL</small><h3>Últimas entregas</h3></div><b>{handoffs.length}</b></div>{handoffs.length?<div className="bar-shift-list">{handoffs.map(h=><div key={h.id}><span><b>{fmt(h.created_at)}</b><small>{h.note}</small></span><strong>{n(h.snapshot?.open_orders)} abiertos</strong></div>)}</div>:<div className="bar-shift-empty">Todavía no hay entregas registradas.</div>}</article>
   {canRepair&&<article className="bar-shift-repair"><small>RECUPERACIÓN SEGURA</small><h3>Corregir estados deducibles</h3><p>Repara mesas desincronizadas, divisiones que debieron cerrarse, comandas faltantes y vuelve a ordenar la Carta por consumo. No inventa ventas, existencias ni datos fiscales.</p><button type="button" onClick={repair} disabled={working}>Revisar y reparar automáticamente</button></article>}
  </div>
 </section>
}
