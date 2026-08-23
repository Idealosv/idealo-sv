import { useEffect, useMemo, useState } from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const qty=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))
const reasonLabel={FALTANTE_OT:'Faltante para OT',AGOTADO:'Agotado',STOCK_BAJO:'Stock bajo',REPOSICION:'Reposición'}

export default function ProcurementSuggestionsPanel({company,supabase}){
  const [suggestions,setSuggestions]=useState([])
  const [drafts,setDrafts]=useState([])
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState('')

  const load=async()=>{
    const [s,p]=await Promise.all([
      supabase.from('inventory_procurement_suggestions').select('*').eq('company_id',company.id).order('reason').order('name'),
      supabase.from('purchases').select('id,number,concept,total,procurement_status,supplier_id,prepared_at,suppliers(name),purchase_items(id,quantity,received_quantity,inventory_item_id,work_order_id,inventory_items(name,unit))').eq('company_id',company.id).in('procurement_status',['DRAFT','ORDERED','PARTIAL']).order('created_at',{ascending:false}).limit(50)
    ])
    const error=s.error||p.error
    if(error)setMessage(error.message)
    else{setSuggestions(s.data||[]);setDrafts(p.data||[])}
  }

  useEffect(()=>{load()},[company.id])

  const totalSuggested=useMemo(()=>suggestions.reduce((sum,r)=>sum+Number(r.suggested_qty||0)*Number(r.estimated_unit_cost||0),0),[suggestions])

  const prepare=async row=>{
    setBusy(`prepare:${row.inventory_item_id}`);setMessage('')
    const {error}=await supabase.rpc('prepare_inventory_purchase',{p_inventory_item:row.inventory_item_id,p_work_order:row.work_order_id||null})
    if(error)setMessage(error.message);else setMessage(`Compra preparada para ${row.name}.`)
    await load();setBusy('')
  }

  const markOrdered=async purchase=>{
    setBusy(`order:${purchase.id}`);setMessage('')
    const {error}=await supabase.from('purchases').update({procurement_status:'ORDERED',updated_at:new Date().toISOString()}).eq('id',purchase.id).eq('company_id',company.id)
    if(error)setMessage(error.message);else setMessage('Compra marcada como ordenada al proveedor.')
    await load();setBusy('')
  }

  const receive=async purchase=>{
    setBusy(`receive:${purchase.id}`);setMessage('')
    const {data,error}=await supabase.rpc('receive_inventory_purchase',{p_purchase:purchase.id})
    if(error)setMessage(error.message);else setMessage(`Recepción registrada. ${Number(data||0)} partida(s) ingresaron al inventario.`)
    await load();setBusy('')
  }

  return <section className="panel" data-procurement-suggestions>
    <div className="panel-heading"><div><p className="form-kicker">ABASTECIMIENTO AUTOMÁTICO</p><h3>Reposición sugerida</h3><p>Detecta stock bajo y faltantes de órdenes de trabajo. Preparar una compra no descuenta caja ni ingresa stock hasta que se reciba.</p></div><span className={suggestions.length?'status dte-pending':'status dte-ready'}>{suggestions.length} pendientes · {money(totalSuggested)}</span></div>
    {message&&<p className={/Compra preparada|marcada|Recepción registrada/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    {suggestions.length?<div className="client-list">{suggestions.map(r=><div className="client-row" key={r.inventory_item_id}>
      <div><strong>{r.name}</strong><small>{r.sku||'Sin SKU'} · {reasonLabel[r.reason]||r.reason} · Disponible {qty(r.available_stock)} {r.unit} · Comprar {qty(r.suggested_qty)} {r.unit}</small><small>Proveedor: {r.supplier_name||'Sin proveedor asignado'}{Number(r.production_shortage||0)>0?` · Faltan ${qty(r.production_shortage)} para producción`:''}</small></div>
      <div><strong>{money(Number(r.suggested_qty||0)*Number(r.estimated_unit_cost||0))}</strong><small>{money(r.estimated_unit_cost)} / {r.unit}</small><button type="button" disabled={busy===`prepare:${r.inventory_item_id}`} onClick={()=>prepare(r)}>{busy===`prepare:${r.inventory_item_id}`?'Preparando…':'Preparar compra'}</button></div>
    </div>)}</div>:<div className="empty-state"><strong>Inventario abastecido</strong><p>No hay artículos por debajo de su objetivo ni faltantes abiertos para producción.</p></div>}

    <div className="panel-heading" style={{marginTop:'18px'}}><div><p className="form-kicker">ÓRDENES PREPARADAS</p><h3>Compras pendientes de recibir</h3></div></div>
    {drafts.length?<div className="client-list">{drafts.map(p=><div className="client-row" key={p.id}>
      <div><strong>COM-{String(p.number||'').padStart(5,'0')} · {p.suppliers?.name||'Proveedor por asignar'}</strong><small>{p.concept} · {p.procurement_status}</small><small>{(p.purchase_items||[]).map(i=>`${i.inventory_items?.name||'Material'} ${qty(i.quantity)} ${i.inventory_items?.unit||''}`).join(' · ')}</small></div>
      <div><strong>{money(p.total)}</strong>{p.procurement_status==='DRAFT'&&<button type="button" className="secondary" disabled={busy===`order:${p.id}`} onClick={()=>markOrdered(p)}>Marcar ordenada</button>}<button type="button" disabled={busy===`receive:${p.id}`} onClick={()=>receive(p)}>{busy===`receive:${p.id}`?'Recibiendo…':'Recibir en inventario'}</button></div>
    </div>)}</div>:<div className="empty-state"><strong>Sin compras preparadas</strong></div>}
  </section>
}
