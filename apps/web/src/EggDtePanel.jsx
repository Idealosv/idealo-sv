import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const date=v=>v?new Date(v).toLocaleString('es-SV'):'—'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggDtePanel({companyId}){
 const [orders,setOrders]=useState([])
 const [customers,setCustomers]=useState([])
 const [links,setLinks]=useState([])
 const [selectedOrder,setSelectedOrder]=useState('')
 const [selectedCustomer,setSelectedCustomer]=useState('')
 const [environment,setEnvironment]=useState('test')
 const [dteType,setDteType]=useState('01')
 const [confirmation,setConfirmation]=useState('')
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [o,c,l]=await Promise.all([
   supabase.from('egg_orders').select('id,order_number,total,paid_amount,status,payment_type,created_at,customer_id,egg_customers(name,preferred_dte_type)').eq('company_id',companyId).neq('status','CANCELLED').order('created_at',{ascending:false}).limit(200),
   supabase.from('egg_customers').select('*').eq('company_id',companyId).eq('active',true).order('name'),
   supabase.from('egg_order_dte_links').select('*,egg_orders(order_number,egg_customers(name)),dte_documents(id,status,control_number,environment,dte_type,created_at)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100)
  ])
  for(const r of [o,c,l])if(r.error)throw r.error
  setOrders(o.data||[]);setCustomers(c.data||[]);setLinks(l.data||[])
  setSelectedOrder(current=>current||o.data?.[0]?.id||'')
  setSelectedCustomer(current=>current||c.data?.[0]?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const customer=customers.find(c=>c.id===selectedCustomer)||null
 const order=orders.find(o=>o.id===selectedOrder)||null
 const linkedOrderIds=useMemo(()=>new Set(links.filter(l=>!['REJECTED','INVALIDATED'].includes(String(l.dte_documents?.status||''))).map(l=>l.order_id)),[links])
 const pendingOrders=orders.filter(o=>!linkedOrderIds.has(o.id))

 useEffect(()=>{
  if(order?.customer_id)setSelectedCustomer(order.customer_id)
  const preferred=order?.egg_customers?.preferred_dte_type
  if(preferred&&['01','03'].includes(preferred))setDteType(preferred)
 },[selectedOrder])

 const updateCustomer=(field,value)=>setCustomers(current=>current.map(c=>c.id===selectedCustomer?{...c,[field]:value}:c))

 const saveFiscal=e=>{e.preventDefault();if(!customer)return
  setSaving(true);setError('');setNotice('')
  const payload={
   nit:customer.nit||null,nrc:customer.nrc||null,business_activity:customer.business_activity||null,activity_code:customer.activity_code||null,
   department:customer.department||null,department_code:customer.department_code||null,municipality:customer.municipality||null,
   municipality_code:customer.municipality_code||null,district_code:customer.district_code||null,
   preferred_dte_type:customer.preferred_dte_type||'01',taxpayer_type:customer.taxpayer_type||'2',
   address:customer.address||'',phone:customer.phone||'',email:customer.email||'',updated_at:new Date().toISOString()
  }
  supabase.from('egg_customers').update(payload).eq('id',customer.id).eq('company_id',companyId).then(async({error})=>{
   if(error){setError(errorText(error));setSaving(false);return}
   setNotice('Datos fiscales guardados para facturación DTE.')
   await load();setSaving(false)
  })
 }

 const createDte=async e=>{
  e.preventDefault();if(!order)return
  setSaving(true);setError('');setNotice('')
  try{
   const {data:{session}}=await supabase.auth.getSession()
   if(!session?.access_token)throw new Error('La sesión expiró. Iniciá sesión nuevamente.')
   const response=await fetch(`${apiUrl}/api/eggs/orders/${order.id}/dte-draft`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify({dteType,environment,confirmation:environment==='production'?confirmation:null})
   })
   const body=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(body.message||'No se pudo crear el DTE.')
   setNotice(`Borrador DTE-${dteType} creado: ${body.dte?.control_number||body.dte?.id}.`)
   setConfirmation('')
   await load()
  }catch(e){setError(errorText(e))}
  finally{setSaving(false)}
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={saveFiscal}>
    <div className="eggs-section-head"><div><small>CLIENTE FISCAL</small><h2>Datos para DTE</h2><p>Factura 01 puede emitirse sin receptor. Crédito Fiscal 03 exige expediente completo.</p></div></div>
    <label className="eggs-field"><span>Cliente</span><select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">Seleccionar</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {customer&&<>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>NIT</span><input value={customer.nit||''} onChange={e=>updateCustomer('nit',e.target.value)} placeholder="NIT del cliente"/></label>
      <label className="eggs-field"><span>NRC</span><input value={customer.nrc||''} onChange={e=>updateCustomer('nrc',e.target.value)} placeholder="NRC"/></label>
     </div>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Código actividad</span><input value={customer.activity_code||''} onChange={e=>updateCustomer('activity_code',e.target.value)} placeholder="Código MH"/></label>
      <label className="eggs-field"><span>Actividad económica</span><input value={customer.business_activity||''} onChange={e=>updateCustomer('business_activity',e.target.value)}/></label>
     </div>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Departamento código</span><input value={customer.department_code||''} onChange={e=>updateCustomer('department_code',e.target.value)} placeholder="00"/></label>
      <label className="eggs-field"><span>Municipio código</span><input value={customer.municipality_code||''} onChange={e=>updateCustomer('municipality_code',e.target.value)} placeholder="00"/></label>
     </div>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Distrito código</span><input value={customer.district_code||''} onChange={e=>updateCustomer('district_code',e.target.value)} placeholder="00"/></label>
      <label className="eggs-field"><span>Tipo DTE preferido</span><select value={customer.preferred_dte_type||'01'} onChange={e=>updateCustomer('preferred_dte_type',e.target.value)}><option value="01">01 · Factura</option><option value="03">03 · Crédito Fiscal</option></select></label>
     </div>
     <label className="eggs-field"><span>Dirección</span><input value={customer.address||''} onChange={e=>updateCustomer('address',e.target.value)}/></label>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Teléfono</span><input value={customer.phone||''} onChange={e=>updateCustomer('phone',e.target.value)}/></label>
      <label className="eggs-field"><span>Correo</span><input type="email" value={customer.email||''} onChange={e=>updateCustomer('email',e.target.value)}/></label>
     </div>
     <button className="eggs-primary" disabled={saving}>Guardar expediente fiscal</button>
    </>}
   </form>

   <form className="eggs-card eggs-form" onSubmit={createDte}>
    <div className="eggs-section-head"><div><small>FACTURACIÓN ELECTRÓNICA</small><h2>Crear borrador DTE</h2><p>Se genera un borrador; no se firma ni transmite automáticamente.</p></div></div>
    <label className="eggs-field"><span>Pedido</span><select required value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)}><option value="">Seleccionar</option>{pendingOrders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name} · {money(o.total)}</option>)}</select></label>
    <div className="eggs-dte-order-summary">
     <div><span>Cliente</span><b>{order?.egg_customers?.name||'—'}</b></div>
     <div><span>Total</span><b>{money(order?.total)}</b></div>
     <div><span>Condición</span><b>{order?.payment_type==='CREDIT'?'Crédito':'Contado'}</b></div>
    </div>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Tipo DTE</span><select value={dteType} onChange={e=>setDteType(e.target.value)}><option value="01">01 · Factura</option><option value="03">03 · Crédito Fiscal</option></select></label>
     <label className="eggs-field"><span>Ambiente</span><select value={environment} onChange={e=>{setEnvironment(e.target.value);setConfirmation('')}}><option value="test">Pruebas MH</option><option value="production">Producción</option></select></label>
    </div>
    {environment==='production'&&<label className="eggs-field"><span>Confirmación de producción</span><input required value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder={`PREPARAR PRODUCCION DTE-${dteType}`}/><small>Para proteger producción, escribí exactamente: PREPARAR PRODUCCION DTE-{dteType}</small></label>}
    <div className="eggs-note">El sistema reutiliza el motor DTE de IDEALO SV. La firma y transmisión siguen bajo los controles de seguridad existentes.</div>
    <button className="eggs-primary" disabled={saving||!order}>Crear borrador DTE</button>
   </form>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>TRAZABILIDAD FISCAL</small><h2>DTE asociados a ventas de huevos</h2></div></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>DTE</th><th>Control</th><th>Ambiente</th><th>Estado</th></tr></thead><tbody>
    {links.map(link=><tr key={link.id}><td>{date(link.created_at)}</td><td>{link.egg_orders?.order_number||'—'}</td><td>{link.egg_orders?.egg_customers?.name||'—'}</td><td>DTE-{link.dte_type}</td><td><b>{link.dte_documents?.control_number||'—'}</b></td><td>{link.environment==='production'?'Producción':'Pruebas'}</td><td><span className={`eggs-pill ${link.dte_documents?.status==='PROCESSED'?'good':link.dte_documents?.status==='REJECTED'?'danger':'warn'}`}>{link.dte_documents?.status||'DRAFT'}</span></td></tr>)}
    {!links.length&&<tr><td colSpan="7"><div className="eggs-empty">Todavía no hay DTE creados desde IDEALO Eggs.</div></td></tr>}
   </tbody></table></div>
  </section>
 </div>
}
