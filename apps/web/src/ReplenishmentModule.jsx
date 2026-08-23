import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const qty=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))

export default function ReplenishmentModule({company,supabase}){
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('')
  const load=async()=>{const {data,error}=await supabase.from('inventory_replenishment_needs').select('*').eq('company_id',company.id).order('production_shortage',{ascending:false}).order('suggested_qty',{ascending:false});if(error)setMessage(error.message);else setRows(data||[])}
  useEffect(()=>{load()},[company.id])
  const estimated=useMemo(()=>rows.reduce((s,r)=>s+Number(r.suggested_qty||0)*Number(r.estimated_unit_cost||0),0),[rows])
  const prepare=async row=>{setBusy(row.inventory_item_id);setMessage('');const {data,error}=await supabase.rpc('create_replenishment_purchase',{p_inventory_item:row.inventory_item_id,p_quantity:Number(row.suggested_qty||0)});if(error)setMessage(error.message);else{setMessage(`Compra preparada correctamente${data?` · ${String(data).slice(0,8)}`:''}. Revisala en Compras y gastos antes de ordenar.`);await load()}setBusy('')}
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">REPOSICIÓN</p><h2>Necesidades de compra</h2><p>Combina stock disponible, mínimos, punto de reorden, objetivo y faltantes de órdenes de producción.</p></div><span className={rows.length?'status dte-pending':'status dte-ready'}>{rows.length} necesidades</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Materiales por reponer</span><strong>{rows.length}</strong></article><article className="metric-card"><span>Sin proveedor</span><strong>{rows.filter(r=>!r.supplier_id).length}</strong></article><article className="metric-card"><span>Compra estimada</span><strong>{money(estimated)}</strong></article></div>
    {message&&<p className={/correctamente|Revisala/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">SUGERENCIAS AUTOMÁTICAS</p><h3>Inventario → Proveedor → Compra</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(r=><div className="client-row" key={r.inventory_item_id}><div><strong>{r.name}</strong><small>{r.sku||'Sin SKU'} · disponible {qty(r.available_stock)} {r.unit} · mínimo {qty(r.minimum_stock)} · faltante producción {qty(r.production_shortage)}</small><small>Proveedor: {r.supplier_name||'SIN ASIGNAR'} · costo estimado {money(r.estimated_unit_cost)} / {r.unit}</small></div><div><strong>{qty(r.suggested_qty)} {r.unit}</strong><small>{money(Number(r.suggested_qty||0)*Number(r.estimated_unit_cost||0))}</small><button type="button" disabled={!r.supplier_id||busy===r.inventory_item_id} onClick={()=>prepare(r)}>{busy===r.inventory_item_id?'Preparando…':r.supplier_id?'Preparar compra':'Asignar proveedor'}</button></div></div>)}</div>:<div className="empty-state"><strong>Inventario abastecido</strong><p>No hay materiales por debajo del punto de reposición ni faltantes pendientes de producción.</p></div>}
    </section>
    <div className="dte-note"><strong>Importante:</strong> “Preparar compra” crea un borrador interno con cantidad y costo estimados. El documento, precio final e impuestos deben confirmarse antes de ordenar al proveedor.</div>
  </section>
}
