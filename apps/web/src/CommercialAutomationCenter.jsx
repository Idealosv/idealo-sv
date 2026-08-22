import { createClient } from '@supabase/supabase-js'
import { useEffect,useMemo,useState } from 'react'
import { createPortal } from 'react-dom'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=url&&key?createClient(url,key,{auth:{persistSession:true}}):null
const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const labels={COLLECTION:'Cobranza',REACTIVATION:'Reactivación',FOLLOW_UP:'Seguimiento',QUOTE:'Cotización'}

export default function CommercialAutomationCenter(){
 const [module,setModule]=useState(''),[company,setCompany]=useState(null),[tasks,setTasks]=useState([]),[intel,setIntel]=useState([]),[busy,setBusy]=useState(''),[mobileOpen,setMobileOpen]=useState(false)
 useEffect(()=>{const sync=()=>{const h=document.querySelector('.erp-header h1')?.textContent?.trim()||'';const mobile=!!document.querySelector('.mobile-app-shell');setModule(mobile?'__MOBILE__':h)};sync();const t=setInterval(sync,500);return()=>clearInterval(t)},[])
 useEffect(()=>{if(!supabase)return;(async()=>{const {data}=await supabase.rpc('get_my_companies');setCompany(data?.[0]?.id||null)})()},[])
 const load=async()=>{if(!company)return;await supabase.rpc('refresh_client_commercial_tasks',{p_company_id:company});const [{data:t},{data:i}]=await Promise.all([
   supabase.from('client_commercial_tasks').select('id,client_id,task_type,priority,title,description,due_at,status,clients(name,phone,whatsapp)').eq('company_id',company).eq('status','OPEN').order('due_at',{ascending:true}).limit(100),
   supabase.from('client_commercial_intelligence').select('client_id,name,commercial_score,commercial_segment,overdue_balance,lifetime_sales,next_best_action').eq('company_id',company).order('commercial_score',{ascending:true}).limit(100)
 ]);setTasks(t||[]);setIntel(i||[])}
 useEffect(()=>{if(company)load()},[company])
 const visible=['Dashboard','Agenda','Asistente IA'].includes(module)
 const critical=useMemo(()=>tasks.filter(x=>['CRITICAL','HIGH'].includes(x.priority)),[tasks])
 const done=async task=>{setBusy(task.id);const {error}=await supabase.from('client_commercial_tasks').update({status:'DONE',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',task.id).eq('company_id',company);setBusy('');if(!error)await load()}
 const openClient=task=>window.dispatchEvent(new CustomEvent('idealo-open-client-context',{detail:{target:'clients',tab:'Clientes',clientId:task.client_id,clientName:task.clients?.name}}))
 const whatsapp=task=>{const raw=String(task.clients?.whatsapp||task.clients?.phone||'').replace(/\D/g,'');if(!raw)return;const p=raw.startsWith('503')?raw:`503${raw}`;window.open(`https://wa.me/${p}?text=${encodeURIComponent(`Hola ${task.clients?.name||''}, te contactamos de IDEALO SV para dar seguimiento.`)}`,'_blank','noopener,noreferrer')}
 if(!visible&&module!=='__MOBILE__')return null
 const panel=<section className={`commercial-auto ${module==='__MOBILE__'?'commercial-auto-mobile':''}`}>
   <header><div><small>AUTOMATIZACIÓN COMERCIAL</small><h3>Clientes que necesitan acción</h3></div><div className="commercial-auto-kpis"><b>{tasks.length}<small>Pendientes</small></b><b>{critical.length}<small>Urgentes</small></b></div></header>
   {tasks.length?<div className="commercial-auto-list">{tasks.slice(0,module==='__MOBILE__'?20:12).map(t=><article key={t.id} className={`commercial-auto-row ${t.priority.toLowerCase()}`}><div><span>{labels[t.task_type]||t.task_type} · {t.priority}</span><strong>{t.clients?.name||'Cliente'} — {t.title}</strong><p>{t.description||''}</p><small>Vence: {new Date(t.due_at).toLocaleString('es-SV')}</small></div><div className="commercial-auto-actions"><button onClick={()=>openClient(t)}>Abrir cliente</button>{(t.clients?.whatsapp||t.clients?.phone)&&<button onClick={()=>whatsapp(t)}>WhatsApp</button>}<button className="ok" disabled={busy===t.id} onClick={()=>done(t)}>Hecho</button></div></article>)}</div>:<div className="commercial-auto-empty">No hay tareas comerciales pendientes.</div>}
   {module==='Dashboard'&&<div className="commercial-auto-risk"><h4>Cartera en riesgo</h4>{intel.filter(x=>['EN_RIESGO','INACTIVO'].includes(x.commercial_segment)).slice(0,5).map(x=><p key={x.client_id}><b>{x.name}</b> · Score {x.commercial_score} · {x.commercial_segment}{Number(x.overdue_balance)>0?` · Mora ${money(x.overdue_balance)}`:''}</p>)}</div>}
   {module==='Asistente IA'&&<div className="commercial-auto-ai"><b>Prioridad sugerida</b><p>{critical[0]?`Atender primero a ${critical[0].clients?.name||'este cliente'}: ${critical[0].title}.`:'No hay alertas críticas; conviene trabajar reactivación y recompra.'}</p></div>}
 </section>
 if(module==='__MOBILE__')return createPortal(<><button className="commercial-auto-fab" onClick={()=>setMobileOpen(true)}>⚡{tasks.length||''}</button>{mobileOpen&&<div className="commercial-auto-backdrop" onMouseDown={()=>setMobileOpen(false)}><div onMouseDown={e=>e.stopPropagation()}>{panel}<button className="commercial-auto-close" onClick={()=>setMobileOpen(false)}>Cerrar</button></div></div>}</>,document.body)
 return createPortal(panel,document.querySelector('.erp-content')||document.body)
}
