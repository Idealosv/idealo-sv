import {useEffect,useMemo,useState} from 'react'
import IdealoBarRoleAwareOperation from './IdealoBarRoleAwareOperation.jsx'
import IdealoBarCatalog from './IdealoBarCatalog.jsx'
import IdealoBarInventory from './IdealoBarInventory.jsx'
import IdealoBarManagementV2 from './IdealoBarManagementV2.jsx'
import './idealo-bar-control-center.css'
import './idealo-bar-structure.css'

export default function IdealoBarWorkspace({company,supabase}){
 const [section,setSection]=useState('operacion')
 const [access,setAccess]=useState(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  let alive=true
  ;(async()=>{
   if(!company?.id||!supabase)return
   const {data,error:e}=await supabase.rpc('bar_my_access',{p_company_id:company.id})
   if(!alive)return
   if(e){setError(e.message);return}
   setAccess(data||{role:'none',active:false,permissions:[]})
  })()
  return()=>{alive=false}
 },[company?.id,supabase])
 const permissions=useMemo(()=>Array.isArray(access?.permissions)?access.permissions:[],[access])
 const has=permission=>permissions.includes('*')||permissions.includes(permission)
 const areas=useMemo(()=>[
  {id:'operacion',label:'▦ Operación',allowed:has('operation.access')},
  {id:'catalogo',label:'🍽️ Carta y productos',allowed:has('admin.manage')},
  {id:'inventario',label:'≡ Inventario y recetas',allowed:has('inventory.view')||has('inventory.manage')||permissions.includes('*')},
  {id:'control',label:'⚙ Administración',allowed:has('admin.manage')}
 ].filter(x=>x.allowed),[permissions])
 useEffect(()=>{
  if(!access)return
  if(!areas.some(a=>a.id===section)&&areas.length)setSection(areas[0].id)
 },[access,areas,section])
 if(error)return <div style={{minHeight:520,display:'grid',placeItems:'center',background:'#0d1015',color:'#ffb1b1'}}><div>{error}</div></div>
 if(!access)return <div style={{minHeight:520,display:'grid',placeItems:'center',background:'#0d1015',color:'#aab5bf'}}>Validando permisos de IDEALO BAR…</div>
 if(!access.active||!areas.length)return <div style={{minHeight:520,display:'grid',placeItems:'center',background:'#0d1015',color:'#fff'}}><div style={{textAlign:'center'}}><div style={{fontSize:40}}>🔐</div><h2>Sin área habilitada</h2><p style={{color:'#9ca7b2'}}>Tu acceso a IDEALO BAR está inactivo o no tiene una función asignada.</p></div></div>
 return <div style={{minHeight:'100%',background:'#0d1015'}}>
  <nav className="bar-workspace-nav" aria-label="Áreas principales de IDEALO BAR">
   {areas.map(area=><button key={area.id} type="button" className={section===area.id?'active':''} onClick={()=>setSection(area.id)}>{area.label}</button>)}
  </nav>
  {section==='operacion'&&<IdealoBarRoleAwareOperation company={company} supabase={supabase} onOpenCatalog={()=>has('admin.manage')&&setSection('catalogo')}/>} 
  {section==='catalogo'&&has('admin.manage')&&<IdealoBarCatalog company={company} supabase={supabase}/>} 
  {section==='inventario'&&(has('inventory.view')||has('inventory.manage')||permissions.includes('*'))&&<IdealoBarInventory company={company} supabase={supabase}/>} 
  {section==='control'&&has('admin.manage')&&<IdealoBarManagementV2 company={company} supabase={supabase}/>} 
 </div>
}
