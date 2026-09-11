import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import IdealoBarWorkspace from '../../web/src/IdealoBarWorkspace.jsx'
import '../../web/src/idealo-bar.css'
import './standalone.css'
import './professional-theme.css'
import './premium-tables.css'
import './orders-dashboard.css'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null
const COMPANY_STORAGE_KEY='idealo-bar-company-id'

function Login({onSignedIn}){
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const submit=async event=>{
  event.preventDefault();setBusy(true);setError('')
  const {data,error:loginError}=await supabase.auth.signInWithPassword({email:email.trim(),password})
  setBusy(false)
  if(loginError){setError(loginError.message);return}
  onSignedIn?.(data.session||null)
 }
 return <main className="bar-login-page"><form className="bar-login-card" onSubmit={submit}>
  <div className="bar-login-logo">🍺</div>
  <h1>IDEALO BAR</h1>
  <p>Sistema independiente para ventas de cerveza y comida rápida, conectado a la información central de IDEALO SV.</p>
  <label>Correo<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label>
  <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
  <button type="submit" disabled={busy}>{busy?'Ingresando…':'Entrar a IDEALO BAR'}</button>
  {error&&<div className="bar-login-error">{error}</div>}
  <p className="bar-login-foot">Usa tu mismo usuario autorizado de IDEALO SV. La aplicación es separada, pero comparte empresa e información operativa.</p>
 </form></main>
}

function StandaloneApp(){
 const [session,setSession]=useState(null)
 const [initializing,setInitializing]=useState(true)
 const [companies,setCompanies]=useState([])
 const [companyId,setCompanyId]=useState('')
 const [error,setError]=useState('')
 const [practiceBusy,setPracticeBusy]=useState(false)
 const [practiceMessage,setPracticeMessage]=useState('')

 useEffect(()=>{
  if(!supabase){setInitializing(false);return}
  supabase.auth.getSession().then(({data})=>{setSession(data.session||null);setInitializing(false)})
  const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next||null))
  return()=>listener.subscription.unsubscribe()
 },[])

 useEffect(()=>{
  if(!session||!supabase){setCompanies([]);setCompanyId('');return}
  let cancelled=false
  const loadCompanies=async()=>{
   setError('')
   const {data:memberships,error:membershipError}=await supabase.rpc('get_my_companies')
   if(cancelled)return
   if(membershipError){setError(membershipError.message);return}
   const ids=[...new Set((memberships||[]).map(row=>row.id||row.company_id).filter(Boolean))]
   if(!ids.length){setError('Tu usuario no tiene empresas disponibles.');return}
   const {data:rows,error:companyError}=await supabase.from('companies').select('*').in('id',ids).order('name')
   if(cancelled)return
   if(companyError){setError(companyError.message);return}
   const resolved=rows?.length?rows:(memberships||[])
   setCompanies(resolved)
   setCompanyId(current=>{
    if(current&&resolved.some(row=>row.id===current))return current
    const remembered=typeof window!=='undefined'?window.localStorage.getItem(COMPANY_STORAGE_KEY):''
    if(remembered&&resolved.some(row=>row.id===remembered))return remembered
    const practice=resolved.find(row=>row.demo_mode===true&&row.slug==='idealo-bar-practica')||resolved.find(row=>row.demo_mode===true)
    return practice?.id||resolved[0]?.id||''
   })
  }
  loadCompanies()
  return()=>{cancelled=true}
 },[session])

 const company=useMemo(()=>companies.find(row=>row.id===companyId)||null,[companies,companyId])
 useEffect(()=>{
  if(typeof window==='undefined')return
  window.__IDEALO_ACTIVE_COMPANY__=company||null
  if(company){
   window.localStorage.setItem(COMPANY_STORAGE_KEY,company.id)
   window.dispatchEvent(new CustomEvent('idealo-company-resolved',{detail:company}))
  }
  setPracticeMessage('')
 },[company])

 const changeCompany=id=>{
  setCompanyId(id)
  if(typeof window!=='undefined')window.localStorage.setItem(COMPANY_STORAGE_KEY,id)
 }

 const resetPractice=async()=>{
  if(!company?.demo_mode||practiceBusy)return
  const accepted=typeof window==='undefined'?false:window.confirm('¿Reiniciar la práctica? Se borrarán pedidos, caja, reservas y movimientos de entrenamiento. La carta y el stock demo volverán a su estado inicial.')
  if(!accepted)return
  setPracticeBusy(true);setPracticeMessage('')
  const {data,error:resetError}=await supabase.rpc('bar_reset_practice_environment',{p_company_id:company.id})
  setPracticeBusy(false)
  if(resetError){setPracticeMessage(`No se pudo reiniciar: ${resetError.message}`);return}
  setPracticeMessage(data?.message||'Práctica reiniciada correctamente.')
  if(typeof window!=='undefined')window.setTimeout(()=>window.location.reload(),700)
 }

 if(initializing)return <div className="bar-loading-page"><div><span className="bar-loading-spinner"/><b>Cargando IDEALO BAR…</b></div></div>
 if(!supabase)return <div className="bar-loading-page"><div><b>Configuración incompleta</b><span>Faltan las variables de conexión a Supabase.</span></div></div>
 if(!session)return <Login onSignedIn={setSession}/>
 if(error&&!companies.length)return <div className="bar-loading-page"><div><b>No se pudo abrir IDEALO BAR</b><span>{error}</span><button onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></div></div>
 if(!company)return <div className="bar-loading-page"><div><span className="bar-loading-spinner"/><b>Cargando empresa…</b></div></div>
 return <div className={`bar-standalone-app ${company.demo_mode?'practice-mode':''}`}>
  <header className="bar-standalone-topbar">
   <div className="bar-brand"><div className="bar-brand-mark">🍺</div><div className="bar-brand-copy"><b>IDEALO BAR</b><span>{company.demo_mode?'Entorno seguro de entrenamiento':'Sistema independiente · conectado a IDEALO SV'}</span></div></div>
   <div className="bar-company-tools">
    {company.demo_mode&&<span className="bar-practice-chip">MODO PRÁCTICA</span>}
    {companies.length>1&&<select value={companyId} onChange={e=>changeCompany(e.target.value)}>{companies.map(row=><option key={row.id} value={row.id}>{row.demo_mode?'🧪 ':''}{row.name||'Empresa'}</option>)}</select>}
    {company.demo_mode&&<button type="button" className="bar-practice-reset" disabled={practiceBusy} onClick={resetPractice}>{practiceBusy?'Reiniciando…':'Reiniciar práctica'}</button>}
    <button type="button" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button>
   </div>
  </header>
  {company.demo_mode&&<div className="bar-practice-banner"><div><b>🧪 MODO PRÁCTICA</b><span>Todo lo que hagas aquí es entrenamiento. DTE PRODUCCIÓN está bloqueado y no afecta la empresa real.</span></div><strong>{practiceMessage||'Stock, precios y recetas son valores demo para practicar.'}</strong></div>}
  <main className="bar-standalone-content"><IdealoBarWorkspace company={company} supabase={supabase}/></main>
 </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><StandaloneApp/></StrictMode>)