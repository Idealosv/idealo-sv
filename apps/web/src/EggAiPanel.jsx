import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const suggestions=[
 '¿Cuánto gané y cuál es mi margen?',
 '¿Qué cliente me debe más?',
 '¿Qué tamaño de huevo se vende mejor?',
 '¿Cuánto debería comprar para los próximos 7 días?',
 '¿Qué proveedor tiene menor costo por huevo?',
 '¿Cuánto estoy perdiendo por merma?',
 'Dame un resumen ejecutivo y prioridades.'
]

export default function EggAiPanel({companyId}){
 const [question,setQuestion]=useState('')
 const [messages,setMessages]=useState([{role:'assistant',text:'Soy el asistente de IDEALO Eggs. Analizo inventario, ventas, utilidad, cartera, pérdidas, proveedores y rutas sin modificar registros.'}])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const bottom=useRef(null)
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages,loading])

 const ask=async text=>{
  const q=String(text||question).trim();if(!q||loading)return
  setQuestion('');setError('');setMessages(current=>[...current,{role:'user',text:q}]);setLoading(true)
  try{
   const {data:{session}}=await supabase.auth.getSession()
   if(!session?.access_token)throw new Error('La sesión expiró.')
   const res=await fetch(apiUrl+'/api/eggs/ai/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({company_id:companyId,question:q})})
   const body=await res.json().catch(()=>({}))
   if(!res.ok)throw new Error(body.message||'No se pudo completar el análisis.')
   setMessages(current=>[...current,{role:'assistant',text:body.answer,model:body.model}])
  }catch(e){setError(String(e?.message||e))}
  finally{setLoading(false)}
 }

 return <div className="eggs-ai-layout">
  <aside className="eggs-card eggs-ai-side">
   <div className="eggs-section-head"><div><small>IDEALO EGGS INTELLIGENCE</small><h2>Preguntas rápidas</h2><p>Respuestas basadas únicamente en los datos de esta empresa.</p></div></div>
   <div className="eggs-ai-suggestions">{suggestions.map(q=><button key={q} onClick={()=>ask(q)} disabled={loading}>{q}</button>)}</div>
   <div className="eggs-note">El asistente es de solo lectura. Las recomendaciones de compra usan el ritmo de venta de los últimos 30 días y una cobertura objetivo de 7 días.</div>
  </aside>
  <section className="eggs-card eggs-ai-main">
   <div className="eggs-section-head"><div><small>ASISTENTE</small><h2>Análisis de tu operación</h2></div><span className="eggs-pill good">Solo lectura</span></div>
   <div className="eggs-ai-chat">
    {messages.map((m,i)=><div key={i} className={'eggs-ai-message '+m.role}><div>{m.text.split('\n').map((line,j)=><p key={j}>{line}</p>)}</div></div>)}
    {loading&&<div className="eggs-ai-message assistant"><div><p>Analizando información actual…</p></div></div>}
    <div ref={bottom}/>
   </div>
   {error&&<div className="eggs-alert error">{error}</div>}
   <form className="eggs-ai-input" onSubmit={e=>{e.preventDefault();ask()}}>
    <textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ejemplo: ¿qué debo comprar esta semana y por qué?" rows="3"/>
    <button className="eggs-primary" disabled={loading||!question.trim()}>Analizar</button>
   </form>
  </section>
 </div>
}
