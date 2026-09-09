import { useState } from 'react'
import IdealoBarOperations from './IdealoBarOperations.jsx'
import IdealoBarCatalog from './IdealoBarCatalog.jsx'
import IdealoBarInventory from './IdealoBarInventory.jsx'
import IdealoBarControlCenter from './IdealoBarControlCenter.jsx'
import './idealo-bar-control-center.css'
import './idealo-bar-structure.css'

export default function IdealoBarWorkspace({company,supabase}){
 const [section,setSection]=useState('operacion')
 return <div style={{minHeight:'100%',background:'#0d1015'}}>
  <nav className="bar-workspace-nav" aria-label="Áreas principales de IDEALO BAR">
   <button type="button" className={section==='operacion'?'active':''} onClick={()=>setSection('operacion')}>▦ Operación</button>
   <button type="button" className={section==='catalogo'?'active':''} onClick={()=>setSection('catalogo')}>🍽️ Carta y productos</button>
   <button type="button" className={section==='inventario'?'active':''} onClick={()=>setSection('inventario')}>≡ Inventario y recetas</button>
   <button type="button" className={section==='control'?'active':''} onClick={()=>setSection('control')}>⚙ Administración</button>
  </nav>
  {section==='operacion'&&<IdealoBarOperations company={company} supabase={supabase} onOpenCatalog={()=>setSection('catalogo')}/>} 
  {section==='catalogo'&&<IdealoBarCatalog company={company} supabase={supabase}/>} 
  {section==='inventario'&&<IdealoBarInventory company={company} supabase={supabase}/>} 
  {section==='control'&&<IdealoBarControlCenter company={company} supabase={supabase}/>} 
 </div>
}
