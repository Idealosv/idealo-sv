import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const ROLE_OPTIONS=[
 ['MANAGER','Gerente'],['SALES','Ventas'],['WAREHOUSE','Bodega'],['CLASSIFIER','Clasificador'],
 ['DRIVER','Motorista'],['CASHIER','Caja'],['VIEWER','Solo lectura']
]
const roleLabel=value=>ROLE_OPTIONS.find(x=>x[0]===value)?.[1]||value||'Sin rol'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggUsersPanel({companyId}){
 const [users,setUsers]=useState([])
 const [eggRoles,setEggRoles]=useState([])
 const [demo,setDemo]=useState(false)
 const [form,setForm]=useState({full_name:'',email:'',egg_role:'SALES'})
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const request=async(path,options={})=>{
  const {data:{session}}=await supabase.auth.getSession()
  if(!session?.access_token)throw new Error('La sesión expiró.')
  const res=await fetch(apiUrl+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,...options.headers}})
  const body=await res.json().catch(()=>({}))
  if(!res.ok)throw new Error(body.message||'No se pudo completar la operación.')
  return body
 }

 const load=useCallback(async()=>{
  if(!companyId)return
  const [userData,rolesRes,companyRes]=await Promise.all([
   request('/api/admin/users?company_id='+encodeURIComponent(companyId)),
   supabase.from('egg_user_roles').select('*').eq('company_id',companyId),
   supabase.from('companies').select('demo_mode').eq('id',companyId).maybeSingle()
  ])
  if(rolesRes.error)throw rolesRes.error
  if(companyRes.error)throw companyRes.error
  setUsers(userData.users||[]);setEggRoles(rolesRes.data||[]);setDemo(Boolean(companyRes.data?.demo_mode))
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const setRole=async(userId,companyRole,eggRole)=>{
  setSaving(true);setError('');setNotice('')
  try{
   if(['owner','admin'].includes(String(companyRole||'').toLowerCase()))throw new Error('Propietarios y administradores conservan sus permisos completos de IDEALO SV.')
   const {error}=await supabase.from('egg_user_roles').upsert({company_id:companyId,user_id:userId,role:eggRole,updated_at:new Date().toISOString()},{onConflict:'company_id,user_id'})
   if(error)throw error
   setNotice('Rol especializado actualizado.')
   await load()
  }catch(e){setError(errorText(e))}
  finally{setSaving(false)}
 }

 const invite=async e=>{
  e.preventDefault();setSaving(true);setError('');setNotice('')
  try{
   const body=await request('/api/admin/users/invite',{method:'POST',body:JSON.stringify({company_id:companyId,email:form.email,role:'staff',full_name:form.full_name,job_title:roleLabel(form.egg_role)})})
   const {error}=await supabase.from('egg_user_roles').upsert({company_id:companyId,user_id:body.user_id,role:form.egg_role},{onConflict:'company_id,user_id'})
   if(error)throw error
   setForm({full_name:'',email:'',egg_role:'SALES'})
   setNotice('Usuario invitado y rol de IDEALO Eggs asignado.')
   await load()
  }catch(e){setError(errorText(e))}
  finally{setSaving(false)}
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  {demo&&<div className="eggs-note">Este entorno es DEMO/desarrollo. IDEALO SV protege las invitaciones reales de usuarios en DEMO. Los roles quedan listos para clientes comerciales.</div>}
  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={invite}>
    <div className="eggs-section-head"><div><small>EQUIPO</small><h2>Invitar usuario</h2><p>Los límites de usuarios dependen del plan contratado.</p></div></div>
    <label className="eggs-field"><span>Nombre</span><input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
    <label className="eggs-field"><span>Correo</span><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label className="eggs-field"><span>Rol IDEALO Eggs</span><select value={form.egg_role} onChange={e=>setForm({...form,egg_role:e.target.value})}>{ROLE_OPTIONS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
    <button className="eggs-primary" disabled={saving||demo}>Enviar invitación</button>
   </form>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>PERMISOS</small><h2>Usuarios de la empresa</h2></div><span className="eggs-pill">{users.length}</span></div>
    <div className="eggs-user-list">
     {users.map(u=>{
      const fixed=['owner','admin'].includes(String(u.role||'').toLowerCase())
      const egg=eggRoles.find(r=>r.user_id===u.user_id)?.role||(u.role==='viewer'?'VIEWER':'SALES')
      return <article key={u.user_id}>
       <div><b>{u.full_name||u.email}</b><small>{u.email}</small><small>Acceso IDEALO SV: {u.role}</small></div>
       {fixed?<span className="eggs-pill good">{u.role==='owner'?'Propietario':'Administrador'}</span>:<select disabled={saving} value={egg} onChange={e=>setRole(u.user_id,u.role,e.target.value)}>{ROLE_OPTIONS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>}
      </article>
     })}
     {!users.length&&<div className="eggs-empty">No hay usuarios disponibles.</div>}
    </div>
   </section>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>MATRIZ DE ACCESO</small><h2>Qué puede hacer cada rol</h2></div></div>
   <div className="eggs-role-grid">
    <div><b>Gerente</b><span>Control completo del vertical.</span></div>
    <div><b>Ventas</b><span>Clientes, pedidos y consulta de precios.</span></div>
    <div><b>Bodega</b><span>Proveedores, recepción, inventario, despachos y devoluciones.</span></div>
    <div><b>Clasificador</b><span>Clasificación, inventario y máquina.</span></div>
    <div><b>Motorista</b><span>Ruta móvil, entregas y cobros.</span></div>
    <div><b>Caja</b><span>Cobros y control de cartera.</span></div>
    <div><b>Solo lectura</b><span>Consulta y reportes sin modificaciones.</span></div>
   </div>
  </section>
 </div>
}
