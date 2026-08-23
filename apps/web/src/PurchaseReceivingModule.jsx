import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const qty=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))
const statusLabel={DRAFT:'Borrador',ORDERED:'Ordenada',PARTIAL_RECEIVED:'Recepción parcial',RECEIVED:'Recibida',CANCELLED:'Cancelada'}

export default function PurchaseReceivingModule({company,supabase}){
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[entry,setEntry]=useState({})
  const load=async()=>{
    const {data,error}=await supabase.from('purchases')
      .select('id,number,purchase_date,concept,total,procurement_status,source_type,received_at,suppliers(name),purchase_items(id,description,inventory_item_id,quantity,received_quantity,unit_cost,inventory_items(name,sku,unit,current_stock,average_cost))')
      .eq('company_id',company.id)
      .eq('source_type','INVENTORY_REORDER')
      .in('procurement_status',['DRAFT','ORDERED','PARTIAL_RECEIVED','RECEIVED'])
      .order('created_at',{ascending:false}).limit(100)
    if(error)setMessage(error.message);else setRows(data||[])
  }
  useEffect(()=>{load()},[company.id])

  const pending=useMemo(()=>rows.filter(r=>r.procurement_status!=='RECEIVED'),[rows])
  const ordered=useMemo(()=>rows.filter(r=>['ORDERED','PARTIAL_RECEIVED'].includes(r.procurement_status)),[rows])
  const pendingLines=useMemo(()=>rows.reduce((s,r)=>s+(r.purchase_items||[]).filter(i=>Number(i.received_quantity||0)<Number(i.quantity||0)).length,0),[rows])

  const markOrdered=async row=>{
    setBusy(`status:${row.id}`);setMessage('')
    const {error}=await supabase.rpc('confirm_purchase_order',{p_purchase:row.id})
    if(error)setMessage(error.message);else setMessage('Compra marcada como ordenada al proveedor.')
    await load();setBusy('')
  }

  const receive=async(row,item)=>{
    const remaining=Math.max(Number(item.quantity||0)-Number(item.received_quantity||0),0)
    const amount=Number(entry[item.id]?.quantity||remaining)
    const unitCost=entry[item.id]?.unit_cost===''||entry[item.id]?.unit_cost==null?Number(item.unit_cost||0):Number(entry[item.id].unit_cost)
    if(amount<=0||amount>remaining)return setMessage(`Cantidad inválida. Pendiente: ${qty(remaining)}.`)
    setBusy(`receive:${item.id}`);setMessage('')
    const {error}=await supabase.rpc('receive_purchase_item',{
      p_purchase_item:item.id,
      p_quantity:amount,
      p_unit_cost:unitCost,
      p_receipt_key:crypto.randomUUID(),
      p_notes:`Recepción ERP · COM-${String(row.number||'').padStart(5,'0')}`,
    })
    if(error)setMessage(error.message);else{setMessage(`Recepción registrada: ${qty(amount)} ${item.inventory_items?.unit||''}. Inventario y costo promedio actualizados.`);setEntry(v=>({...v,[item.id]:{quantity:'',unit_cost:''}}))}
    await load();setBusy('')
  }

  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">RECEPCIÓN</p><h2>Compras de inventario</h2><p>Recibe cada material total o parcialmente. Cada recepción genera Kardex PURCHASE_IN y actualiza existencias y costo promedio.</p></div><span className={pending.length?'status dte-pending':'status dte-ready'}>{pendingLines} partidas pendientes</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Compras pendientes</span><strong>{pending.length}</strong></article><article className="metric-card"><span>Listas para recibir</span><strong>{ordered.length}</strong></article><article className="metric-card"><span>Valor pendiente</span><strong>{money(pending.reduce((s,r)=>s+Number(r.total||0),0))}</strong></article></div>
    {message&&<p className={/marcada|Recepción registrada|actualizados/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">FLUJO DE COMPRA</p><h3>Borrador → Ordenada → Parcial → Recibida</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(r=><article className="panel" key={r.id} style={{marginBottom:12}}><div className="panel-heading"><div><strong>COM-{String(r.number||'').padStart(5,'0')} · {r.suppliers?.name||'Sin proveedor'}</strong><small>{r.purchase_date} · {r.concept} · {statusLabel[r.procurement_status]||r.procurement_status}</small></div><div><strong>{money(r.total)}</strong>{r.procurement_status==='DRAFT'&&<button type="button" disabled={busy===`status:${r.id}`} onClick={()=>markOrdered(r)}>{busy===`status:${r.id}`?'Procesando…':'Marcar ordenada'}</button>}{r.procurement_status==='RECEIVED'&&<small>Ingreso completado {r.received_at?new Date(r.received_at).toLocaleString('es-SV'):''}</small>}</div></div>
        <div className="client-list">{(r.purchase_items||[]).map(i=>{const received=Number(i.received_quantity||0),orderedQty=Number(i.quantity||0),remaining=Math.max(orderedQty-received,0),inv=i.inventory_items;return <div className="client-row" key={i.id}><div><strong>{i.description||inv?.name||'Material'}</strong><small>{inv?`${inv.sku||'Sin SKU'} · stock ${qty(inv.current_stock)} ${inv.unit||''} · costo prom. ${money(inv.average_cost)}`:'Sin vínculo a Inventario'}</small><small>Ordenado {qty(orderedQty)} · recibido {qty(received)} · pendiente {qty(remaining)}</small></div><div style={{minWidth:260}}>{remaining<=0?<span className="status dte-ready">RECIBIDO</span>:['ORDERED','PARTIAL_RECEIVED'].includes(r.procurement_status)?<><label className="field"><span>Recibir ahora</span><input type="number" min="0.001" max={remaining} step="0.001" placeholder={String(remaining)} value={entry[i.id]?.quantity||''} onChange={e=>setEntry(v=>({...v,[i.id]:{...v[i.id],quantity:e.target.value}}))}/></label><label className="field"><span>Costo unitario real</span><input type="number" min="0" step="0.0001" placeholder={String(i.unit_cost||0)} value={entry[i.id]?.unit_cost||''} onChange={e=>setEntry(v=>({...v,[i.id]:{...v[i.id],unit_cost:e.target.value}}))}/></label><button type="button" disabled={!i.inventory_item_id||busy===`receive:${i.id}`} onClick={()=>receive(r,i)}>{busy===`receive:${i.id}`?'Recibiendo…':i.inventory_item_id?'Registrar recepción':'Vincular inventario'}</button></>:<span className="status dte-pending">Ordenar primero</span>}</div></div>})}</div>
      </article>)}</div>:<div className="empty-state"><strong>Sin compras de reposición</strong><p>Prepará una compra desde la pestaña Reposición cuando exista una necesidad de inventario.</p></div>}
    </section>
    <div className="dte-note"><strong>Control:</strong> una recepción nunca puede superar lo pendiente. Cada recepción usa una clave única para impedir que un reintento duplique el movimiento de inventario.</div>
  </section>
}
