import {useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase.js'
import './saas-commercial-control.css'

const API=(import.meta.env.VITE_API_URL||'http://localhost:4000').replace(/\/$/,'')
const money=value=>`$${Number(value||0).toFixed(2)}`
const date=value=>value?new Date(value).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'

export default function SaasCommercialControlHost(){
 const path=window.location.pathname
 const enabled=path==='/master/finanzas'
 const [session,setSession]=useState(null),[dashboard,setDashboard]=useState(null),[billing,setBilling]=useState(null),[planChanges,setPlanChanges]=useState([]),[loading,setLoading]=useState(enabled),[error,setError]=useState(''),[saving,setSaving]=useState('')
 useEffect(()=>{if(!enabled||!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[enabled])
 const request=async(path,options={})=>{if(!session?.access_token)throw new Error('Iniciá sesión con la cuenta administradora.');const r=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...options.headers}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.message||'No se pudo completar la operación.');return body}
 const reload=async()=>{if(!session)return;setLoading(true);setError('');try{const [d,b,p]=await Promise.all([request('/api/admin/saas/dashboard'),request('/api/admin/saas/billing'),request('/api/admin/saas/plan-changes')]);setDashboard(d);setBilling(b);setPlanChanges(p.requests||[])}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{if(enabled&&session)reload()},[enabled,session])
 const merged=useMemo(()=>{const billMap=new Map((billing?.companies||[]).map(x=>[x.id,x]));return (dashboard?.companies||[]).map(row=>({...row,billing:billMap.get(row.id)||null}))},[dashboard,billing])
 const pending=useMemo(()=>planChanges.filter(x=>x.status==='pending'),[planChanges])
 if(!enabled)return null
 const m=dashboard?.metrics||{},bm=billing?.metrics||{}
 const commercialPlans=dashboard?.commercial_plans?.length?dashboard.commercial_plans:(dashboard?.plans||[]).filter(p=>p.active!==false&&String(p.code||'').toUpperCase()!=='OWNER_INTERNAL')
 const changePlan=async(row,planId)=>{setSaving(row.id);setError('');try{await request(`/api/admin/saas/companies/${row.id}/subscription`,{method:'PATCH',body:JSON.stringify({plan_id:planId})});await reload()}catch(e){setError(e.message)}finally{setSaving('')}}
 const review=async(item,decision)=>{setSaving(item.id);setError('');try{await request(`/api/admin/saas/plan-changes/${item.id}`,{method:'PATCH',body:JSON.stringify({decision})});await reload()}catch(e){setError(e.message)}finally{setSaving('')}}
 return <div className="saas-commercial-root">
  <header><div><small>IDEALO SV · CONTROL COMERCIAL</small><h1>Finanzas y Planes SaaS</h1><p>Ingresos, cartera, límites por plan, renovaciones y estado comercial de cada empresa.</p></div><div className="saas-commercial-actions"><a href="/master">Membresías</a><a href="/master/cobros">Cobros</a><button onClick={reload} disabled={loading}>Actualizar</button></div></header>
  {error&&<div className="saas-commercial-error">{error}</div>}
  {loading?<div className="saas-commercial-loading">Cargando control comercial…</div>:dashboard&&billing&&<>
   <section className="saas-commercial-metrics">
    <Metric label="MRR" value={money(m.mrr)} hint="solo cuentas comerciales"/>
    <Metric label="Cobrado" value={money(bm.total_collected)} hint="histórico comercial"/>
    <Metric label="Por cobrar" value={money(bm.balance_due)} hint="saldo comercial" danger={Number(bm.balance_due)>0}/>
    <Metric label="Activas" value={m.active||0} hint="clientes al día"/>
    <Metric label="Pruebas" value={m.trial||0} hint="prospectos comerciales"/>
    <Metric label="Vencidas" value={m.past_due||0} hint="en gracia" danger={(m.past_due||0)>0}/>
    <Metric label="Suspendidas" value={m.suspended||0} hint="sin acceso" danger={(m.suspended||0)>0}/>
    <Metric label="Cambios de plan" value={pending.length} hint="solicitudes pendientes" danger={pending.length>0}/>
   </section>
   {pending.length>0&&<section className="saas-commercial-card"><div className="saas-commercial-card-head"><div><small>SOLICITUDES</small><h2>Cambios de plan pendientes</h2></div><span>{pending.length} pendientes</span></div><div className="saas-commercial-table-wrap"><table><thead><tr><th>Empresa</th><th>Plan actual</th><th>Plan solicitado</th><th>Fecha</th><th>Motivo</th><th>Decisión</th></tr></thead><tbody>{pending.map(item=><tr key={item.id}><td><strong>{item.company?.name||'Empresa'}</strong><small>{item.company?.slug||''}</small></td><td>{item.current_plan?.name||'—'}<small>{money(item.current_plan?.monthly_price)}/mes</small></td><td><strong>{item.requested_plan?.name||'—'}</strong><small>{money(item.requested_plan?.monthly_price)}/mes · {item.requested_plan?.max_users??'—'} usuarios</small></td><td>{date(item.created_at)}</td><td>{item.reason||'Sin comentario'}</td><td><div className="saas-commercial-actions"><button disabled={saving===item.id} onClick={()=>review(item,'approved')}>Aprobar</button><button disabled={saving===item.id} onClick={()=>review(item,'rejected')}>Rechazar</button></div></td></tr>)}</tbody></table></div></section>}
   <section className="saas-commercial-card">
    <div className="saas-commercial-card-head"><div><small>CARTERA COMPLETA</small><h2>Empresas, planes y límites</h2></div><span>{m.companies||0} comerciales · {merged.length} registros</span></div>
    <div className="saas-commercial-table-wrap"><table><thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Próximo cobro</th><th>Saldo</th><th>Onboarding</th></tr></thead><tbody>{merged.map(row=>{const sub=row.subscription,plan=sub?.plan,bill=row.billing;const exempt=row.billing_exempt===true||bill?.billing_exempt===true||row.account_type==='demo'||row.account_type==='internal';const max=Number(plan?.max_users||0);const onboarding=exempt?null:[row.users>0,Boolean(sub),Boolean(sub?.activation_paid_at)||Number(plan?.activation_fee||0)===0,['trial','active','past_due'].includes(sub?.status)].filter(Boolean).length;return <tr key={row.id}><td><strong>{row.name}</strong><small>{row.account_type==='demo'?'DEMO · ':row.account_type==='internal'?'INTERNA · ':''}{row.slug}</small></td><td>{exempt?<><strong>{plan?.name||'Sin plan'}</strong><small>Sin cobro comercial</small></>:<><select value={plan?.id||''} disabled={!sub||saving===row.id} onChange={e=>changePlan(row,e.target.value)}><option value="">Sin plan</option>{commercialPlans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.monthly_price)}/mes</option>)}</select><small>{plan?`${money(plan.activation_fee)} activación`:''}</small></>}</td><td><span className={`saas-status ${sub?.status||'none'}`}>{row.account_type==='internal'?'interna':row.account_type==='demo'?`demo · ${sub?.status||'—'}`:sub?.status||'sin membresía'}</span></td><td><strong>{row.users}/{max||'—'}</strong><small>{max&&row.users>=max?'Límite alcanzado':'Disponible'}</small></td><td><strong>{exempt?'—':date(bill?.next_charge_at)}</strong><small>{exempt?'Fuera de cartera':bill?.overdue_days>0?`${bill.overdue_days} días vencida`:''}</small></td><td><strong>{exempt?'No aplica':money(bill?.balance_due)}</strong><small>{exempt?'Sin cobro':bill?.activation_pending?'Activación pendiente':bill?.monthly_pending?'Mensualidad pendiente':'Al día'}</small></td><td><strong>{exempt?'—':`${onboarding}/4`}</strong><small>{exempt?'No comercial':onboarding===4?'Listo para operar':'Pendiente de completar'}</small></td></tr>})}</tbody></table></div>
   </section>
  </>}
 </div>
}
function Metric({label,value,hint,danger=false}){return <article className={danger?'danger':''}><small>{label}</small><strong>{value}</strong><span>{hint}</span></article>}