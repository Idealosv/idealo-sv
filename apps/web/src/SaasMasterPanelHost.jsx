import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './saas-master-panel.css'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const statuses=['trial','active','past_due','suspended','cancelled']
const labels={trial:'Prueba',active:'Activo',past_due:'Vencido',suspended:'Suspendido',cancelled:'Cancelado'}

export default function SaasMasterPanelHost(){
 const enabled=window.location.pathname==='/master'
 const [session,setSession]=useState(null)
 const [loading,setLoading]=useState(enabled)
 const [error,setError]=useState('')
 const [data,setData]=useState(null)
 const [search,setSearch]=useState('')
 const [form,setForm]=useState({name:'',owner_email:'',plan_id:'',vertical_id:'',trial_days:14,demo_mode:true})
 const [saving,setSaving]=useState(false)
 useEffect(()=>{if(!enabled||!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>listener.subscription.unsubscribe()},[enabled])
 const request=async(path,options={})=>{if(!session?.access_token)throw new Error('Iniciá sesión para entrar al Panel Maestro.');const response=await fetch(`${apiUrl}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...options.headers}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'No se pudo completar la operación.');return body}
 const reload=async()=>{if(!session)return;setLoading(true);setError('');try{const next=await request('/api/admin/saas/dashboard');setData(next);setForm(current=>({...current,plan_id:current.plan_id||next.plans?.[0]?.id||'',vertical_id:current.vertical_id||next.verticals?.find(x=>x.code==='ADVERTISING')?.id||next.verticals?.[0]?.id||''}))}catch(err){setError(err.message)}finally{setLoading(false)}}
 useEffect(()=>{if(enabled&&session)reload()},[enabled,session])
 const rows=useMemo(()=>{const term=search.trim().toLowerCase();if(!term)return data?.companies||[];return(data?.companies||[]).filter(row=>`${row.name} ${row.slug} ${row.demo_mode?'demo':''} ${row.subscription?.plan?.name||''} ${row.subscription?.vertical?.name||''}`.toLowerCase().includes(term))},[data,search])
 if(!enabled)return null
 const createCompany=async event=>{event.preventDefault();setSaving(true);setError('');try{await request('/api/admin/saas/companies',{method:'POST',body:JSON.stringify(form)});setForm(current=>({...current,name:'',owner_email:''}));await reload()}catch(err){setError(err.message)}finally{setSaving(false)}}
 const updateSubscription=async(companyId,payload)=>{setSaving(true);setError('');try{await request(`/api/admin/saas/companies/${companyId}/subscription`,{method:'PATCH',body:JSON.stringify(payload)});await reload()}catch(err){setError(err.message)}finally{setSaving(false)}}
 const recordPayment=async row=>{const raw=window.prompt(`Monto recibido de ${row.name}`,'50');if(raw===null)return;const amount=Number(raw);if(!amount||amount<=0)return;const reference=window.prompt('Referencia del pago (opcional)','')||'';setSaving(true);try{await request(`/api/admin/saas/companies/${row.id}/payments`,{method:'POST',body:JSON.stringify({amount,reference})});await updateSubscription(row.id,{status:'active',renew:true})}catch(err){setError(err.message);setSaving(false)}}
 return <div className="saas-master-root">
  <header className="saas-master-header"><div><span className="saas-master-brand">IDEALO SV</span><h1>Panel Maestro</h1><p>Empresas, demos comerciales, rubros, planes, vencimientos y control SaaS.</p></div><div className="saas-master-actions"><a href="/">Volver al ERP</a><button onClick={reload} disabled={loading}>Actualizar</button></div></header>
  {!session&&<section className="saas-master-message">Iniciá sesión con la cuenta administradora y regresá a <strong>/master</strong>.</section>}
  {error&&<section className="saas-master-error">{error}</section>}
  {loading?<section className="saas-master-message">Cargando Panel Maestro…</section>:data&&<>
   <section className="saas-master-metrics">
    <Metric label="Empresas" value={data.metrics.companies}/><Metric label="Demos" value={data.metrics.demos||0}/><Metric label="Activas" value={data.metrics.active}/><Metric label="En prueba" value={data.metrics.trial}/><Metric label="Vencidas" value={data.metrics.past_due}/><Metric label="Suspendidas" value={data.metrics.suspended}/><Metric label="Vencen ≤ 7 días" value={data.metrics.expiring_soon}/><Metric label="MRR estimado" value={`$${Number(data.metrics.mrr||0).toFixed(2)}`}/>
   </section>
   <section className="saas-master-grid">
    <form className="saas-master-card saas-master-create" onSubmit={createCompany}><div><small>NUEVO CLIENTE</small><h2>Crear empresa</h2></div><label>Empresa<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required minLength="2"/></label><label>Correo del propietario<input type="email" value={form.owner_email} onChange={e=>setForm({...form,owner_email:e.target.value})} required/></label><label>Rubro<select value={form.vertical_id} onChange={e=>setForm({...form,vertical_id:e.target.value})}>{data.verticals.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Plan<select value={form.plan_id} onChange={e=>setForm({...form,plan_id:e.target.value})}>{data.plans.map(x=><option key={x.id} value={x.id}>{x.name} · ${Number(x.monthly_price).toFixed(2)}</option>)}</select></label><label>Días de prueba<input type="number" min="0" max="90" value={form.trial_days} onChange={e=>setForm({...form,trial_days:Number(e.target.value)})}/></label><label className="saas-demo-option"><input type="checkbox" checked={form.demo_mode} onChange={e=>setForm({...form,demo_mode:e.target.checked})}/><span><strong>Preparar como DEMO para agencia</strong><small>Precarga clientes, productos, cotizaciones y producción ficticios. DTE PRODUCCIÓN queda bloqueado.</small></span></label><button disabled={saving}>{saving?'Procesando…':form.demo_mode?'Crear demo comercial':'Crear empresa'}</button></form>
    <section className="saas-master-card saas-master-list"><div className="saas-master-list-head"><div><small>CARTERA SaaS</small><h2>Empresas</h2></div><input placeholder="Buscar empresa, plan, rubro o demo" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="saas-master-table-wrap"><table><thead><tr><th>Empresa</th><th>Tipo</th><th>Rubro</th><th>Plan</th><th>Usuarios</th><th>Estado</th><th>Vence</th><th>Acciones</th></tr></thead><tbody>{rows.map(row=><CompanyRow key={row.id} row={row} plans={data.plans} verticals={data.verticals} saving={saving} onUpdate={updateSubscription} onPayment={recordPayment}/>)}</tbody></table></div>{!rows.length&&<p className="saas-master-empty">No hay empresas que coincidan.</p>}</section>
   </section>
  </>}
 </div>
}
function Metric({label,value}){return <article><small>{label}</small><strong>{value}</strong></article>}
function CompanyRow({row,plans,verticals,saving,onUpdate,onPayment}){const sub=row.subscription;const expiry=row.demo_mode?(row.demo_expires_at||sub?.trial_ends_at):(sub?.current_period_end||sub?.trial_ends_at);return <tr><td><strong>{row.name}</strong><small>{row.slug}</small></td><td>{row.demo_mode?<span className="saas-demo-badge">DEMO</span>:<span className="saas-live-badge">CLIENTE</span>}</td><td><select value={sub?.vertical_id||''} disabled={!sub||saving} onChange={e=>onUpdate(row.id,{vertical_id:e.target.value})}><option value="">Sin rubro</option>{verticals.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></td><td><select value={sub?.plan_id||''} disabled={!sub||saving} onChange={e=>onUpdate(row.id,{plan_id:e.target.value})}><option value="">Sin plan</option>{plans.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></td><td>{row.users}</td><td><select className={`status-${sub?.status||'none'}`} value={sub?.status||''} disabled={!sub||saving} onChange={e=>onUpdate(row.id,{status:e.target.value})}><option value="">Sin suscripción</option>{statuses.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select></td><td>{expiry?new Date(expiry).toLocaleDateString('es-SV'):'—'}</td><td><div className="saas-master-row-actions"><button type="button" disabled={!sub||saving} onClick={()=>onPayment(row)}>Registrar pago</button><button type="button" disabled={!sub||saving} onClick={()=>onUpdate(row.id,{status:'active',renew:true})}>Renovar 30 días</button></div></td></tr>}
