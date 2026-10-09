import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './prestaditos-portal.css'

const money=n=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(n)||0)
const labels={PENDING:'Pendiente',REVIEW:'En revisión',APPROVED:'Aprobada',REJECTED:'Rechazada',SIGNATURE:'En firma',FUNDS_RECEIVED:'Fondos recibidos',ACTIVE:'Activa',MATURING:'Próxima a vencer',MATURED:'Vencida',RENEWED:'Renovada',CLOSED:'Cerrada',COMPLETED:'Completada',POSTED:'Registrado',REVERSED:'Revertido'}
const demoData={
 investor:{id:'demo',name:'María Elena López',investor_code:'INV-DEMO-001',status:'ACTIVE'},
 investments:[{id:'demo-inv',code:'INV-DEMO-100',principal:5000,rate:12,status:'ACTIVE',granted_at:'2026-02-01',maturity_date:'2027-02-01',term_months:12}],
 applications:[{id:'demo-app',code:'SOL-DEMO-001',amount:5000,status:'ACTIVE',months:12,created_at:'2026-01-28'}],
 payments:[{id:'demo-pay',code:'PAG-DEMO-001',amount:150,type:'YIELD',date:'2026-05-01',status:'POSTED',investment_id:'demo-inv'}],
 withdrawals:[]
}
function Brand(){return <div className="pti-brand"><img src="/prestaditos-logo.svg" alt="Logo de Prestaditos"/><div><b>PRESTADITO$</b><small>INVERSIONISTAS · EL SALVADOR</small></div></div>}
const todaySv=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const date=s=>s?new Date((s.length===10?s+'T12:00:00':s)).toLocaleDateString('es-SV'):'—'
const errorText=e=>e?.message||String(e||'No fue posible completar la operación')
export default function PrestaditosPortalApp(){
 const params=new URLSearchParams(window.location.search)
 const companyId=params.get('company')||''
 const demo=params.get('demo')==='1'
 const [session,setSession]=useState(null)
 const [ready,setReady]=useState(false)
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [signup,setSignup]=useState(false)
 const [profile,setProfile]=useState(null)
 const [data,setData]=useState(demo?demoData:null)
 const [registration,setRegistration]=useState({full_name:'',dui:'',phone:''})
 const [view,setView]=useState('inicio')
 const [form,setForm]=useState({type:'contribution',amount:'',months:'12',start:todaySv(),method:'Transferencia bancaria',place:'',investment_id:'',payment_type:'CAPITAL_RETURN',notes:''})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [loading,setLoading]=useState(false)
 useEffect(()=>{
  if(demo||!supabase){setReady(true);return}
  supabase.auth.getSession().then(({data:auth})=>{setSession(auth.session);setReady(true)})
  const {data:sub}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s))
  return ()=>sub.subscription.unsubscribe()
 },[demo])
 const reload=useCallback(async()=>{
  if(!session||!companyId||demo)return
  setLoading(true);setError('')
  const {data:enroll,error:e}=await supabase.from('inv_portal_enrollments').select('*')
   .eq('company_id',companyId).eq('user_id',session.user.id).maybeSingle()
  if(e){setError('No se pudo abrir el portal: '+e.message);setLoading(false);return}
  setProfile(enroll)
  if(enroll?.status==='APPROVED'){
   const result=await supabase.rpc('inv_portal_dashboard',{p_company:companyId})
   if(result.error)setError(result.error.message)
   else setData(result.data)
  }else setData(null)
  setLoading(false)
 },[session?.user?.id,companyId,demo])
 useEffect(()=>{void reload()},[reload])
 const signIn=async e=>{
  e.preventDefault();setBusy(true);setError('');setNotice('')
  const {data:result,error:err}=signup?
   await supabase.auth.signUp({email:email.trim(),password}):
   await supabase.auth.signInWithPassword({email:email.trim(),password})
  setBusy(false)
  if(err){setError(err.message);return}
  if(signup&&!result.session)setNotice('Revisa tu correo y confirma tu cuenta antes de ingresar.')
 }
 const enroll=async e=>{
  e.preventDefault();setBusy(true);setError('');setNotice('')
  const {error:err}=await supabase.from('inv_portal_enrollments').insert({
   company_id:companyId,user_id:session.user.id,full_name:registration.full_name.trim(),
   dui:registration.dui.trim(),phone:registration.phone.trim(),email:session.user.email
  })
  setBusy(false)
  if(err){setError(err.message);return}
  setNotice('Solicitud enviada. Prestaditos verificará tu expediente antes de habilitar las inversiones.')
  await reload()
 }
 const send=async e=>{
  e.preventDefault()
  const amount=Number(form.amount)
  if(!Number.isFinite(amount)||amount<=0){setError('Ingresa un monto válido.');return}
  if(!demo&&!data)return
  setBusy(true);setError('');setNotice('')
  if(demo){
   const id='demo-'+Date.now()
   if(form.type==='contribution'){
    setData(d=>({...d,applications:[{id,code:'SOL-DEMO-NUEVA',amount,status:'PENDING',months:Number(form.months),created_at:new Date().toISOString()},...d.applications]}))
   }else{
    setData(d=>({...d,withdrawals:[{id,amount,type:form.payment_type,status:'PENDING',investment_id:form.investment_id||'demo-inv',created_at:new Date().toISOString()},...d.withdrawals]}))
   }
   setNotice('SOLICITUD SIMULADA: no se envió ninguna información ni se movió dinero.')
  }else{
   const rpcName=form.type==='contribution'?'inv_portal_submit_application':'inv_portal_submit_withdrawal'
   const args=form.type==='contribution'?{
    p_company:companyId,p_amount:amount,p_months:Number(form.months),
    p_start:form.start,p_method:form.method,p_place:form.place,p_notes:form.notes
   }:{
    p_company:companyId,p_investment:form.investment_id,p_type:form.payment_type,
    p_amount:amount,p_method:form.method,p_notes:form.notes
   }
   const {error:err}=await supabase.rpc(rpcName,args)
   if(err){setError(err.message);setBusy(false);return}
   setNotice('Solicitud recibida. Aparecerá en el ERP de Prestaditos para revisión.')
   await reload()
  }
  setBusy(false);setView('solicitudes');setForm(s=>({...s,amount:'',notes:''}))
 }
 const info=data||null
 const active=(info?.investments||[]).filter(x=>['ACTIVE','MATURING','MATURED'].includes(x.status))
 const capital=active.reduce((s,x)=>s+Number(x.principal||0),0)
   -(info?.payments||[]).filter(x=>x.status==='POSTED'&&x.type==='CAPITAL_RETURN'&&active.some(i=>i.id===x.investment_id)).reduce((s,x)=>s+Number(x.amount||0),0)
 const gains=(info?.payments||[]).filter(x=>x.status==='POSTED'&&x.type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const allRequests=[...(info?.applications||[]).map(x=>({...x,kind:'Inversión'})),...(info?.withdrawals||[]).map(x=>({...x,kind:'Retiro',amount:x.amount||0}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
 return <div className="pti-root">
  <header className="pti-header"><Brand/><div>{demo?<span className="pti-demo">DEMO FICTICIA</span>:session?<button onClick={()=>supabase.auth.signOut()}>Salir</button>:<a href="/">IDEALO SV</a>}</div></header>
  {!companyId&&!demo?<main className="pti-card pti-centered"><h2>Se necesita un enlace de invitación</h2><p>Solicita a Prestaditos el enlace oficial para inversionistas. No debes registrarte como empresa comercial en IDEALO SV.</p></main>:
  !ready?<main className="pti-centered">Verificando cuenta…</main>:
  !demo&&!supabase?<main className="pti-centered">Falta configurar Supabase.</main>:
  !demo&&!supabase?<main className="pti-card pti-centered"><h2>No se configuró Supabase</h2><p>El sistema no puede iniciar sesión hasta que se configure la conexión existente.</p></main>:
  !demo&&!session?<main className="pti-card pti-centered"><p className="pti-kicker">ACCESO PRIVADO</p><h1>{signup?'Crear mi cuenta':'Ingresar como inversionista'}</h1><p>Tu acceso debe ser aprobado por Prestaditos. Registrarte no constituye una inversión.</p>
   <form onSubmit={signIn} className="pti-form"><label>Correo<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña<input type="password" minLength="6" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="pti-primary" disabled={busy}>{busy?'Procesando…':signup?'Solicitar cuenta':'Ingresar'}</button></form>
   <button className="pti-text-button" onClick={()=>{setSignup(!signup);setError('');setNotice('')}}>{signup?'Ya tengo una cuenta':'Quiero registrarme'}</button></main>:
  !demo&&loading?<main className="pti-centered">Cargando información…</main>:
  !demo&&!profile?<main className="pti-card pti-centered"><p className="pti-kicker">SOLICITUD DE ACCESO</p><h1>Datos del inversionista</h1><p>Prestaditos verificará estos datos contra tu expediente antes de permitirte consultar inversiones.</p>
   <form onSubmit={enroll} className="pti-form"><label>Nombre completo<input minLength="3" maxLength="120" required value={registration.full_name} onChange={e=>setRegistration({...registration,full_name:e.target.value})}/></label><label>DUI<input required minLength="8" maxLength="20" placeholder="00000000-0" value={registration.dui} onChange={e=>setRegistration({...registration,dui:e.target.value})}/></label><label>Teléfono<input required minLength="8" maxLength="25" value={registration.phone} onChange={e=>setRegistration({...registration,phone:e.target.value})}/></label><button disabled={busy} className="pti-primary">Enviar solicitud de acceso</button></form></main>:
  !demo&&profile?.status!=='APPROVED'?<main className="pti-card pti-centered"><h1>Registro {profile?.status==='REJECTED'?'rechazado':'en revisión'}</h1><p>Prestaditos revisará tu solicitud de acceso. No se ha recibido dinero ni aprobado ninguna inversión.</p><p>{profile?.decision_notes||''}</p><button onClick={reload}>Consultar estado</button></main>:
  info?<main className="pti-layout">
   <div className="pti-intro"><div><p>Hola, {info.investor.name.split(' ')[0]}</p><h1>Mis inversiones</h1><small>{info.investor.investor_code}</small></div><span className="pti-pill">Acceso aprobado</span></div>
   {view==='inicio'&&<>
    <div className="pti-balance"><span>Capital vigente registrado</span><strong>{money(Math.max(0,capital))}</strong><small>Según las inversiones y devoluciones asentadas en el ERP</small></div>
    <div className="pti-stats"><article><span>Rendimientos pagados</span><strong>{money(gains)}</strong></article><article><span>Inversiones registradas</span><strong>{info.investments.length}</strong></article></div>
    <div className="pti-card"><h2>Mis inversiones</h2>{info.investments.length?info.investments.map(x=><div className="pti-list-row" key={x.id}><div><b>{x.code}</b><small>Vence {date(x.maturity_date)} · {x.rate||'—'}% anual</small></div><div><b>{money(x.principal)}</b><small>{labels[x.status]||x.status}</small></div></div>):<p>Sin inversiones registradas.</p>}</div>
    <div className="pti-card"><h2>¿Qué deseas hacer?</h2><div className="pti-actions"><button onClick={()=>{setForm(s=>({...s,type:'contribution'}));setView('enviar')}}>Solicitar inversión</button><button onClick={()=>{setForm(s=>({...s,type:'withdrawal',investment_id:active[0]?.id||''}));setView('enviar')}}>Solicitar retiro</button></div></div>
   </>}
   {view==='enviar'&&<div className="pti-card"><p className="pti-kicker">FORMULARIO</p><h2>Enviar solicitud</h2><div className="pti-tabs"><button className={form.type==='contribution'?'active':''} onClick={()=>setForm(s=>({...s,type:'contribution'}))}>Inversión</button><button className={form.type==='withdrawal'?'active':''} onClick={()=>setForm(s=>({...s,type:'withdrawal',investment_id:active[0]?.id||''}))}>Retiro</button></div>
    <form className="pti-form" onSubmit={send}>
     <label>Inversionista<input readOnly value={info.investor.name}/></label>
     <label>Monto solicitado (USD)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
     {form.type==='contribution'?<><label>Plazo solicitado (meses)<input required type="number" min="1" max="60" value={form.months} onChange={e=>setForm({...form,months:e.target.value})}/></label><label>Fecha de inicio deseada<input required type="date" min={todaySv()} value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label>Lugar de aporte (opcional)<input maxLength="120" value={form.place} onChange={e=>setForm({...form,place:e.target.value})}/></label></>:
      <><label>Inversión relacionada<select required value={form.investment_id} onChange={e=>setForm({...form,investment_id:e.target.value})}><option value="">Seleccionar inversión</option>{active.map(i=><option key={i.id} value={i.id}>{i.code} · {money(i.principal)}</option>)}</select></label><label>Tipo de retiro<select value={form.payment_type} onChange={e=>setForm({...form,payment_type:e.target.value})}><option value="CAPITAL_RETURN">Capital</option><option value="YIELD">Rendimientos</option></select></label></>}
     <label>Forma de pago solicitada<select value={form.method} onChange={e=>setForm({...form,method:e.target.value})}><option>Transferencia bancaria</option><option>Depósito bancario</option><option>Pago presencial</option></select></label>
     <label>Observaciones<textarea rows="3" maxLength="1000" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
     <p className="pti-disclaimer">Al enviar, únicamente solicitas revisión. No es transferencia de fondos ni garantía de rendimiento.</p>
     <button disabled={busy||(form.type==='withdrawal'&&!active.length)} className="pti-primary">{busy?'Enviando…':'Enviar solicitud'}</button>
    </form></div>}
   {view==='solicitudes'&&<div className="pti-card"><h2>Solicitudes enviadas</h2>{allRequests.length?allRequests.map(x=><div className="pti-list-row" key={x.id}><div><b>{x.kind}</b><small>{date(x.created_at)} · {x.code||x.id.slice(0,8)}</small></div><div><b>{money(x.amount)}</b><small>{labels[x.status]||x.status}</small></div></div>):<p>Aún no tienes solicitudes.</p>}</div>}
   {view==='pagos'&&<div className="pti-card"><h2>Historial de pagos</h2>{info.payments.length?info.payments.map(x=><div className="pti-list-row" key={x.id}><div><b>{x.type==='YIELD'?'Rendimiento':x.type==='CAPITAL_RETURN'?'Devolución de capital':'Ajuste'}</b><small>{date(x.date)} · {x.code}</small></div><div><b>{money(x.amount)}</b><small>{labels[x.status]||x.status}</small></div></div>):<p>Sin pagos registrados.</p>}</div>}
   <p className="pti-disclaimer">Los saldos son informativos y reflejan únicamente los asientos del ERP. Consulta tu contrato para conocer condiciones y riesgos.</p>
  </main>:<main className="pti-centered">No hay información de inversión disponible.</main>}
  {error&&<div className="pti-toast pti-error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}
  {notice&&<div className="pti-toast" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
  {(demo||data)&&<nav className="pti-bottom">{[['inicio','⌂','Inicio'],['solicitudes','☷','Solicitudes'],['enviar','＄','Invertir'],['pagos','▤','Pagos']].map(([id,ic,name])=><button className={view===id?'active':''} key={id} onClick={()=>{setView(id);setError('')}}><b>{ic}</b><small>{name}</small></button>)}</nav>}
 </div>
}
