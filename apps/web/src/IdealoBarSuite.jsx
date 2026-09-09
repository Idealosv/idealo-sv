import {useState} from 'react'
import IdealoBar from './IdealoBar.jsx'
import IdealoBarControlCenter from './IdealoBarControlCenter.jsx'
import './idealo-bar-control-center.css'

export default function IdealoBarSuite({company,supabase}){
 const [mode,setMode]=useState('operation')
 return <div className="bar-suite">
  <div className="bar-suite-switch" role="tablist" aria-label="Vista de IDEALO BAR">
   <button type="button" className={mode==='operation'?'active':''} onClick={()=>setMode('operation')}>🍺 Operación</button>
   <button type="button" className={mode==='control'?'active':''} onClick={()=>setMode('control')}>⚙ 10 bloques</button>
  </div>
  {mode==='operation'?<IdealoBar company={company} supabase={supabase}/>:<IdealoBarControlCenter company={company} supabase={supabase}/>} 
 </div>
}
