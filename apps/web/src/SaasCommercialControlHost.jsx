import {useEffect,useMemo,useState} from 'react'
import {supabase} from './lib/supabase.js'
import './saas-commercial-control.css'

const API=(import.meta.env.VITE_API_URL||'http://localhost:4000').replace(/\/$/,'')
const money=value=>`$${Number(value||0).toFixed(2)}`
const date=value=>value?new Date(value).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'

export default function SaasCommercialControlHost(){
 const path=window.location.pathname
 const enabled=path==='/master'||path==='/master/finanzas'
 const full=path==='/master/finanzas'
 const [session,setSession]=useState(null),[dashboard,setDashboard]=useState(null),[billing,setBilling]=useState(null),[loading,setLoading]=useState(full),[error,setError]=useState(''),[saving,setSaving]=useState('')
 useEffect(()=>{if(!enabled||!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[enabled])
 const request=async(path,options={})=>{if(!session?.access_token)throw new Error('Iniciá sesión con la cuenta administradora.');const r=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...options.headers}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.message||'No se pudo completar la operación.');return body}
 const reload=async()=>{if(!session)return;setLoading(true);setError('');try{const [d,b]=await Promise.all([request('/api/admin/saas/dashboard'),request('/api/admin/saas/billing')]);setDashboard(d);setBilling(b)}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{if(full&&session)reload()},[full,session])
 const merged=useMemo(()=>{const billMap=new Map((billing?.companies||[]).map(x=>[x.id,x]));return (dashboard?.companies||[]).map(row=>({...row,billing:billMap.get(row.id)||null}))},[dashboard,billing])
 if(!enabled)return null
 if(!full)return <a className="saas-commercial-fab" href="/master/finanzas">Finanzas SaaS</a>
 const m=dashboard?.metrics||{},bm=billing?.metrics||{}
 const changePlan=async(row,planId)=>{setSaving(row.id);setError('');try{await request(`/api/admin/saas/companies/${row.id}/subscription`,{method:'PATCH',body:JSON.stringify({plan_id:planId})});await reload()}catch(e){setError(e.message)}finally{setSaving('')}}
 return <div className="saas-commercial-root">
  <header><div><small>IDEALO SV · CONTROL COMERCIAL</small><h1>Finanzas y Planes SaaS</h1><p>Ingresos, cartera, límites por plan, renovaciones y estado comercial de cada empresa.</p></div><div className="saas-commercial-actions"><a href="/master">Membresías</a><a href="/master/cobros">Cobros</a><button onClick={reload} disabled={loading}>Actualizar</button></div></header>
  {error&&<div className="saas-commercial-error">{error}</div>}
  {loading?<div className="saas-commercial-loading">Cargando control comercial…</div>:dashboard&&billing&&<>
   <section className="saas-commercial-metrics">
    <Metric label="MRR" value={money(m.mrr)} hint="ingreso mensual recurrente"/>
    <Metric label="Cobrado" value={money(bm.total_collected)} hint="histórico registrado"/>
    <Metric label="Por cobrar" value={money(bm.balance_due)} hint="saldo comercial" danger={Number(bm.balance_due)>0}/>
    <Metric label="Activas" value={m.active||0} hint="membresías al día"/>
    <Metric label="Pruebas" value={m.trial||0} hint="prospectos activos"/>
    <Metric label="Vencidas" value={m.past_due||0} hint="en gracia" danger={(m.past_due||0)>0}/>
    <Metric label="Suspendidas" value={m.suspended||0} hint="sin acceso" danger={(m.suspended||0)>0}/>
    <Metric label="Activación pendiente" value={m.activation_pending||0} hint="por cobrar" danger={(m.activation_pending||0)>0}/>
   </section>
   <section className="saas-commercial-card">
    <div className="saas-commercial-card-head"><div><small>CARTERA COMPLETA</small><h2>Empresas, planes y límites</h2></div><span>{merged.length} empresas</span></div>
    <div className="saas-commercial-table-wrap"><table><thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Próximo cobro</th><th>Saldo</th><th>Onboarding</th></tr></thead><tbody>{merged.map(row=>{const sub=row.subscription,plan=sub?.plan,bill=row.billing;const max=Number(plan?.max_users||0);const onboarding=[row.users>0,Boolean(sub),Boolean(sub?.activation_paid_at),['trial','active','past_due'].includes(sub?.status)].filter(Boolean).length;return <tr key={row.id}><td><strong>{row.name}</strong><small>{row.slug}</small></td><td><select value={plan?.id||''} disabled={!sub||saving===row.id} onChange={e=>changePlan(row,e.target.value)}><option value="">Sin plan</option>{dashboard.plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.monthly_price)}/mes</option>)}</select><small>{plan?`${money(plan.activation_fee)} activación`:''}</small></td><td><span className={`saas-status ${sub?.status||'none'}`}>{sub?.status||'sin membresía'}</span></td><td><strong>{row.users}/{max||'—'}</strong><small>{max&&row.users>=max?'Límite alcanzado':'Disponible'}</small></td><td><strong>{date(bill?.next_charge_at)}</strong><small>{bill?.overdue_days>0?`${bill.overdue_days} días vencida`:''}</small></td><td><strong>{money(bill?.balance_due)}</strong><small>{bill?.activation_pending?'Activación pendiente':bill?.monthly_pending?'Mensualidad pendiente':'Al día'}</small></td><td><strong>{onboarding}/4</strong><small>{onboarding===4?'Listo para operar':'Pendiente de completar'}</small></td></tr>})}</tbody></table></div>
   </section>
  </>}
 </div>
}
function Metric({label,value,hint,danger=false}){return <article className={danger?'danger':''}><small>{label}</small><strong>{value}</strong><span>{hint}</span></article>}
