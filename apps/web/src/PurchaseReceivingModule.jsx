import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const qty=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))
const statusLabel={DRAFT:'Borrador',ORDERED:'Ordenada',PARTIAL_RECEIVED:'Recepción parcial',RECEIVED:'Recibida',CANCELLED:'Cancelada'}

export default function PurchaseReceivingModule({company,supabase}){
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('')
  const load=async()=>{
    const {data,error}=await supabase.from('purchases')
      .select('id,number,purchase_date,concept,total,procurement_status,source_type,received_at,suppliers(name),purchase_items(id,inventory_item_id,quantity,received_quantity,unit_cost,inventory_items(name,unit))')
      .eq('company_id',company.id)
      .eq('source_type','INVENTORY_REORDER')
      .in('procurement_status',['DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED'])
      .order('created_at',{ascending:false}).limit(100)
    if(error)setMessage(error.message);else setRows(data||[])
  }
  useEffect(()=>{load()},[company.id])

  const pending=useMemo(()=>rows.filter(r=>r.procurement_status!=='RECEIVED'),[rows])
  const ordered=useMemo(()=>rows.filter(r=>['ORDERED','PARTIAL_RECEIVED'].includes(r.procurement_status)),[rows])

  const setStatus=async(row,status)=>{
    setBusy(`status:${row.id}`);setMessage('')
    const {error}=await supabase.from('purchases').update({procurement_status:status,updated_at:new Date().toISOString()}).eq('id',row.id).eq('company_id',company.id)
    if(error)setMessage(error.message);else setMessage(status==='ORDERED'?'Compra marcada como ordenada al proveedor.':'Compra cancelada.')
    await load();setBusy('')
  }

  const receive=async row=>{
    setBusy(`receive:${row.id}`);setMessage('')
    const {data,error}=await supabase.rpc('receive_inventory_purchase',{p_purchase:row.id})
    if(error)setMessage(error.message);else setMessage(`Recepción completada: ${Number(data||0)} partida(s) ingresaron al inventario.`)
    await load();setBusy('')
  }

  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">RECEPCIÓN</p><h2>Compras de inventario</h2><p>Confirma qué compras ya fueron ordenadas y registra su entrada real al Kardex cuando el proveedor entregue.</p></div><span className={pending.length?'status dte-pending':'status dte-ready'}>{pending.length} pendientes</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Pendientes</span><strong>{pending.length}</strong></article><article className="metric-card"><span>Listas para recibir</span><strong>{ordered.length}</strong></article><article className="metric-card"><span>Valor pendiente</span><strong>{money(pending.reduce((s,r)=>s+Number(r.total||0),0))}</strong></article></div>
    {message&&<p className={/marcada|Recepción completada|cancelada/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">FLUJO DE COMPRA</p><h3>Borrador → Ordenada → Recibida</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(r=><div className="client-row" key={r.id}><div><strong>COM-{String(r.number||'').padStart(5,'0')} · {r.suppliers?.name||'Sin proveedor'}</strong><small>{r.purchase_date} · {r.concept} · {statusLabel[r.procurement_status]||r.procurement_status}</small><small>{(r.purchase_items||[]).map(i=>`${i.inventory_items?.name||'Material'} ${qty(i.received_quantity)}/${qty(i.quantity)} ${i.inventory_items?.unit||''}`).join(' · ')||'Sin partidas de inventario'}</small></div><div><strong>{money(r.total)}</strong>{r.procurement_status==='DRAFT'&&<button type="button" disabled={busy===`status:${r.id}`} onClick={()=>setStatus(r,'ORDERED')}>Marcar ordenada</button>}{['ORDERED','PARTIAL_RECEIVED'].includes(r.procurement_status)&&<button type="button" disabled={busy===`receive:${r.id}`} onClick={()=>receive(r)}>{busy===`receive:${r.id}`?'Recibiendo…':'Recibir en inventario'}</button>}{r.procurement_status==='RECEIVED'&&<small>Ingreso completado {r.received_at?new Date(r.received_at).toLocaleString('es-SV'):''}</small>}</div></div>)}</div>:<div className="empty-state"><strong>Sin compras de reposición</strong><p>Prepará una compra desde la pestaña Reposición cuando exista una necesidad de inventario.</p></div>}
    </section>
    <div className="dte-note"><strong>Control:</strong> recibir una compra genera un movimiento PURCHASE_IN por cada partida y actualiza existencias y costo promedio. Una compra en borrador no altera inventario.</div>
  </section>
}
