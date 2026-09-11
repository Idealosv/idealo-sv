import {useCallback,useEffect,useMemo,useState} from 'react'
import IdealoBarOperationsV2 from './IdealoBarOperationsV2.jsx'
import IdealoBarCatalog from './IdealoBarCatalog.jsx'
import IdealoBarInventory from './IdealoBarInventory.jsx'
import IdealoBarSimpleManagement from './IdealoBarSimpleManagement.jsx'
import './idealo-bar-control-center.css'
import './idealo-bar-structure.css'
import './idealo-bar-role-permissions.css'
import './idealo-bar-mobile.css'
import './idealo-bar-professional.css'
import './idealo-bar-clean-light.css'
import './idealo-bar-owner-simple.css'
import './idealo-bar-balanced-professional.css'
import './idealo-bar-dark-lounge.css'
import './idealo-bar-dark-contrast-fix.css'
import './idealo-bar-light-panels-dark-text.css'
import './idealo-bar-light-forms.css'
import './idealo-bar-cash-professional.css'

const roleLabel={owner:'Propietario',manager:'Gerente',cashier:'Cajero',waiter:'Mesero',kitchen:'Cocina',bar:'Barra',warehouse:'Bodega',none:'Sin rol'}

export default function IdealoBarWorkspace({company,supabase}){
 const [section,setSection]=useState('vender')
 const [access,setAccess]=useState(null)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)

 const loadAccess=useCallback(async()=>{
  if(!company?.id||!supabase)return
  setLoading(true);setError('')
  const {data,error:e}=await supabase.rpc('bar_my_access',{p_company_id:company.id})
  if(e){setError(e.message);setAccess(null)}
  else setAccess(data||{role:'none',active:false,display_name:'',permissions:[]})
  setLoading(false)
 },[company?.id,supabase])

 useEffect(()=>{loadAccess()},[loadAccess])

 const permissions=useMemo(()=>Array.isArray(access?.permissions)?access.permissions:[],[access])
 const has=useCallback(permission=>permissions.includes('*')||permissions.includes(permission),[permissions])
 const managementAllowed=useMemo(()=>has('admin.view')||has('admin.manage')||has('payment.take')||has('bill.request')||has('inventory.view')||has('inventory.manage'),[has])
 const areas=useMemo(()=>[
  {id:'vender',label:'Vender',allowed:has('operation.access')},
  {id:'carta',label:'Carta',allowed:has('catalog.manage')},
  {id:'inventario',label:'Inventario',allowed:has('inventory.view')||has('inventory.manage')},
  {id:'gestion',label:'Gestión',allowed:managementAllowed},
 ].filter(area=>area.allowed),[has,managementAllowed])

 useEffect(()=>{
  if(!access||!areas.length)return
  if(!areas.some(area=>area.id===section))setSection(areas[0].id)
 },[access,areas,section])

 if(loading)return <div className="bar-role-workspace-loading"><b>IDEALO BAR</b><span>Preparando tu espacio de trabajo…</span></div>
 if(error)return <div className="bar-role-workspace-lock"><span>!</span><h2>No se pudo validar el acceso</h2><p>{error}</p></div>
 if(!access?.active||!areas.length)return <div className="bar-role-workspace-lock"><span>🔒</span><h2>Sin área habilitada</h2><p>Tu acceso a IDEALO BAR está inactivo o no tiene una función asignada. Gerencia puede corregirlo en Personal y permisos.</p></div>

 return <div className="bar-workspace-root" data-bar-role={access.role||'none'}>
  <nav className="bar-workspace-nav" aria-label="Áreas principales de IDEALO BAR">
   {areas.map(area=><button key={area.id} type="button" className={section===area.id?'active':''} onClick={()=>setSection(area.id)}>{area.label}</button>)}
   <div className="bar-workspace-role-chip" aria-label={`Rol actual: ${roleLabel[access.role]||access.role}`}><span>{roleLabel[access.role]||access.role}</span><small>{access.display_name||''}</small></div>
  </nav>

  {section==='vender'&&has('operation.access')&&<IdealoBarOperationsV2 company={company} supabase={supabase} access={access} onOpenCatalog={()=>has('catalog.manage')&&setSection('carta')}/>} 
  {section==='carta'&&has('catalog.manage')&&<IdealoBarCatalog company={company} supabase={supabase}/>} 
  {section==='inventario'&&(has('inventory.view')||has('inventory.manage'))&&<IdealoBarInventory company={company} supabase={supabase}/>} 
  {section==='gestion'&&managementAllowed&&<IdealoBarSimpleManagement company={company} supabase={supabase} access={access} onOpenCatalog={()=>has('catalog.manage')&&setSection('carta')} onOpenInventory={()=>setSection('inventario')}/>} 
 </div>
}