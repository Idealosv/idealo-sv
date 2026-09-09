import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import IdealoBarWorkspace from '../../web/src/IdealoBarWorkspace.jsx'
import '../../web/src/idealo-bar.css'
import './standalone.css'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null

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
   setCompanyId(current=>current&&resolved.some(row=>row.id===current)?current:resolved[0]?.id||'')
  }
  loadCompanies()
  return()=>{cancelled=true}
 },[session])

 const company=useMemo(()=>companies.find(row=>row.id===companyId)||null,[companies,companyId])
 useEffect(()=>{
  if(typeof window==='undefined')return
  window.__IDEALO_ACTIVE_COMPANY__=company||null
  if(company)window.dispatchEvent(new CustomEvent('idealo-company-resolved',{detail:company}))
 },[company])

 if(initializing)return <div className="bar-loading-page"><div><span className="bar-loading-spinner"/><b>Cargando IDEALO BAR…</b></div></div>
 if(!supabase)return <div className="bar-loading-page"><div><b>Configuración incompleta</b><span>Faltan las variables de conexión a Supabase.</span></div></div>
 if(!session)return <Login onSignedIn={setSession}/>
 if(error&&!companies.length)return <div className="bar-loading-page"><div><b>No se pudo abrir IDEALO BAR</b><span>{error}</span><button onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></div></div>
 if(!company)return <div className="bar-loading-page"><div><span className="bar-loading-spinner"/><b>Cargando empresa…</b></div></div>
 return <div className="bar-standalone-app">
  <header className="bar-standalone-topbar">
   <div className="bar-brand"><div className="bar-brand-mark">🍺</div><div className="bar-brand-copy"><b>IDEALO BAR</b><span>Sistema independiente · conectado a IDEALO SV</span></div></div>
   <div className="bar-company-tools">
    {companies.length>1&&<select value={companyId} onChange={e=>setCompanyId(e.target.value)}>{companies.map(row=><option key={row.id} value={row.id}>{row.name||'Empresa'}</option>)}</select>}
    <button type="button" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button>
   </div>
  </header>
  <main className="bar-standalone-content"><IdealoBarWorkspace company={company} supabase={supabase}/></main>
 </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><StandaloneApp/></StrictMode>)
