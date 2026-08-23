import {useEffect,useMemo,useState} from 'react'

const qty=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))

export default function PurchaseReceivingModule({company,supabase}){
  const [rows,setRows]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[entry,setEntry]=useState({})
  const load=async()=>{
    const {data,error}=await supabase.from('purchases')
      .select('id,number,purchase_date,concept,procurement_status,supplier_id,suppliers(name),purchase_items(id,description,quantity,received_quantity,unit_cost,inventory_item_id,inventory_items(name,sku,unit,current_stock,average_cost))')
      .eq('company_id',company.id)
      .in('procurement_status',['DRAFT','ORDERED','PARTIAL_RECEIVED'])
      .order('purchase_date',{ascending:false}).limit(100)
    if(error)setMessage(error.message);else setRows(data||[])
  }
  useEffect(()=>{load()},[company.id])
  const pending=useMemo(()=>rows.reduce((s,p)=>s+(p.purchase_items||[]).filter(i=>Number(i.received_quantity||0)<Number(i.quantity||0)).length,0),[rows])
  const order=async p=>{setBusy(p.id);setMessage('');const{error}=await supabase.rpc('confirm_purchase_order',{p_purchase:p.id});if(error)setMessage(error.message);else{setMessage(`COM-${String(p.number).padStart(5,'0')} marcada como ordenada.`);await load()}setBusy('')}
  const receive=async(p,item)=>{
    const key=item.id,remaining=Math.max(Number(item.quantity||0)-Number(item.received_quantity||0),0)
    const amount=Number(entry[key]?.quantity||remaining),cost=Number(entry[key]?.unit_cost||item.unit_cost||0)
    if(amount<=0||amount>remaining)return setMessage(`Cantidad inválida. Pendiente: ${qty(remaining)}.`)
    setBusy(key);setMessage('')
    const receiptKey=crypto.randomUUID()
    const {error}=await supabase.rpc('receive_purchase_item',{p_purchase_item:item.id,p_quantity:amount,p_unit_cost:cost,p_receipt_key:receiptKey,p_notes:`Recepción desde ERP · COM-${String(p.number).padStart(5,'0')}`})
    if(error)setMessage(error.message);else{setMessage(`Recepción registrada: ${qty(amount)} ${item.inventory_items?.unit||''} de ${item.description}. Inventario actualizado.`);setEntry(v=>({...v,[key]:{quantity:'',unit_cost:''}}));await load()}
    setBusy('')
  }
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">RECEPCIÓN</p><h2>Compras → Inventario</h2><p>Recibe materiales total o parcialmente. Cada recepción genera Kardex PURCHASE_IN y actualiza costo promedio.</p></div><span className={pending?'status dte-pending':'status dte-ready'}>{pending} partidas pendientes</span></div>
    {message&&<p className={/registrada|ordenada|actualizado/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">ÓRDENES ABIERTAS</p><h3>Recepciones pendientes</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(p=><article key={p.id} className="panel" style={{marginBottom:12}}><div className="panel-heading"><div><strong>COM-{String(p.number).padStart(5,'0')} · {p.suppliers?.name||'Proveedor ocasional'}</strong><small>{p.purchase_date} · {p.concept}</small></div><div><span className="status dte-pending">{p.procurement_status}</span>{p.procurement_status==='DRAFT'&&<button type="button" disabled={busy===p.id} onClick={()=>order(p)}>{busy===p.id?'Procesando…':'Marcar ordenada'}</button>}</div></div>
        <div className="client-list">{(p.purchase_items||[]).map(item=>{const received=Number(item.received_quantity||0),ordered=Number(item.quantity||0),remaining=Math.max(ordered-received,0),inv=item.inventory_items;return <div className="client-row" key={item.id}><div><strong>{item.description}</strong><small>{inv?`${inv.sku||'Sin SKU'} · stock ${qty(inv.current_stock)} ${inv.unit||''} · costo prom. ${money(inv.average_cost)}`:'Sin vínculo a Inventario'}</small><small>Ordenado {qty(ordered)} · recibido {qty(received)} · pendiente {qty(remaining)}</small></div><div style={{minWidth:260}}>{remaining>0&&p.procurement_status!=='DRAFT'?<><label className="field"><span>Recibir ahora</span><input type="number" min="0.001" max={remaining} step="0.001" placeholder={String(remaining)} value={entry[item.id]?.quantity||''} onChange={e=>setEntry(v=>({...v,[item.id]:{...v[item.id],quantity:e.target.value}}))}/></label><label className="field"><span>Costo unitario</span><input type="number" min="0" step="0.0001" placeholder={String(item.unit_cost||0)} value={entry[item.id]?.unit_cost||''} onChange={e=>setEntry(v=>({...v,[item.id]:{...v[item.id],unit_cost:e.target.value}}))}/></label><button type="button" disabled={!item.inventory_item_id||busy===item.id} onClick={()=>receive(p,item)}>{busy===item.id?'Recibiendo…':item.inventory_item_id?'Registrar recepción':'Vincular inventario'}</button></>:<span className="status dte-ready">{remaining<=0?'RECIBIDO':'Ordenar primero'}</span>}</div></div>})}</div>
      </article>)}</div>:<div className="empty-state"><strong>Sin recepciones pendientes</strong><p>No hay compras abiertas para recibir.</p></div>}
    </section>
    <div className="dte-note"><strong>Control:</strong> una recepción no puede superar la cantidad pendiente. La misma clave de recepción no puede generar dos movimientos de inventario.</div>
  </section>
}
