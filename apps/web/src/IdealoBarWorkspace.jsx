import { useState } from 'react'
import IdealoBar from './IdealoBar.jsx'
import IdealoBarInventory from './IdealoBarInventory.jsx'

export default function IdealoBarWorkspace({company,supabase}){
 const [section,setSection]=useState('operacion')
 return <div style={{minHeight:'100%',background:'#0d1015'}}>
  <nav className="bar-tabs" style={{margin:0,padding:'12px 18px',borderBottom:'1px solid #303742',background:'#11151b'}} aria-label="Áreas de IDEALO BAR">
   <button type="button" className={section==='operacion'?'active':''} onClick={()=>setSection('operacion')}>▦ <span>Operación</span></button>
   <button type="button" className={section==='inventario'?'active':''} onClick={()=>setSection('inventario')}>≡ <span>Recetas e inventario</span></button>
  </nav>
  {section==='operacion'?<IdealoBar company={company} supabase={supabase}/>:<IdealoBarInventory company={company} supabase={supabase}/>} 
 </div>
}
