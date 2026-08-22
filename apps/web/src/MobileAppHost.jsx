import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null
const today=()=>new Date().toISOString().slice(0,10)
const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))

export default function MobileAppHost(){
  const [visible,setVisible]=useState(window.location.pathname==='/mobile')
  const [company,setCompany]=useState(null)
  const [tab,setTab]=useState('Inicio')
  const [loading,setLoading]=useState(true)
  const [data,setData]=useState({orders:[],agenda:[],clients:[],quotes:[],alerts:[]})

  useEffect(()=>{const handler=e=>{if(e.detail==='App móviles')setVisible(true);else if(window.location.pathname!=='/mobile')setVisible(false)};window.addEventListener('idealo-module-change',handler);return()=>window.removeEventListener('idealo-module-change',handler)},[])
  useEffect(()=>{if(!supabase)return;const loadCompany=async()=>{const {data:s}=await supabase.auth.getSession();if(!s.session){setCompany(null);setLoading(false);return}const {data:list}=await supabase.rpc('get_my_companies');const id=list?.[0]?.id;if(!id){setLoading(false);return}const {data:c}=await supabase.from('companies').select('id,name').eq('id',id).single();setCompany(c||null)};loadCompany()},[])
  useEffect(()=>{if(!company||!supabase)return;let alive=true;(async()=>{setLoading(true);const [o,a,c,q,ar,ap,inv]=await Promise.all([
    supabase.from('work_orders').select('id,number,title,status,priority,due_at,total,clients(name)').eq('company_id',company.id).order('due_at',{ascending:true}).limit(40),
    supabase.from('production_schedule_events').select('id,title,event_type,status,priority,scheduled_start,location,work_order_id').eq('company_id',company.id).gte('scheduled_start',`${today()}T00:00:00`).order('scheduled_start',{ascending:true}).limit(30),
    supabase.from('clients').select('id,name,phone,email,status').eq('company_id',company.id).order('created_at',{ascending:false}).limit(40),
    supabase.from('quotes').select('id,number,status,total,valid_until,created_at,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(40),
    supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,clients(name)').eq('company_id',company.id),
    supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,suppliers(name)').eq('company_id',company.id),
    supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit').eq('company_id',company.id).eq('active',true)
  ]);if(!alive)return;const alerts=[];const now=today();(ar.data||[]).filter(x=>!['PAID','CANCELLED'].includes(x.status)&&x.due_date&&x.due_date<now).slice(0,3).forEach(x=>alerts.push(`Cobro vencido: ${x.clients?.name||'Cliente'}`));(ap.data||[]).filter(x=>!['PAID','CANCELLED'].includes(x.status)&&x.due_date&&x.due_date<now).slice(0,3).forEach(x=>alerts.push(`Pago vencido: ${x.suppliers?.name||'Proveedor'}`));(inv.data||[]).filter(x=>Number(x.current_stock||0)<=Number(x.minimum_stock||0)).slice(0,4).forEach(x=>alerts.push(`Stock bajo: ${x.name}`));setData({orders:o.data||[],agenda:a.data||[],clients:c.data||[],quotes:q.data||[],alerts});setLoading(false)})();return()=>{alive=false}},[company])

  const home=useMemo(()=>{const active=data.orders.filter(x=>!['DELIVERED','CANCELLED'].includes(x.status));return {active,late:active.filter(x=>x.due_at&&x.due_at<new Date().toISOString()),todayAgenda:data.agenda.filter(x=>x.scheduled_start?.slice(0,10)===today()),openQuotes:data.quotes.filter(x=>!['REJECTED','EXPIRED','CONVERTED'].includes(x.status))}},[data])
  if(!visible)return null
  const close=()=>{if(window.location.pathname==='/mobile')window.history.back();else setVisible(false)}
  return createPortal(<div className="mobile-app-shell">
    <header className="mobile-topbar"><div><span className="mobile-brand-mark">I</span><div><strong>IDEALO SV</strong><small>{company?.name||'App móvil'}</small></div></div><button type="button" onClick={close}>×</button></header>
    <main className="mobile-content">{loading?<div className="mobile-empty">Sincronizando información…</div>:<>
      {tab==='Inicio'&&<><section className="mobile-hero"><p>HOY EN IDEALO</p><h1>Control desde tu teléfono</h1><div className="mobile-kpis"><Kpi t="OT activas" v={home.active.length}/><Kpi t="Atrasadas" v={home.late.length}/><Kpi t="Agenda hoy" v={home.todayAgenda.length}/><Kpi t="Cotizaciones" v={home.openQuotes.length}/></div></section>{data.alerts.length>0&&<section className="mobile-card"><h3>Necesita atención</h3>{data.alerts.map((x,i)=><div className="mobile-alert" key={i}>{x}</div>)}</section>}<section className="mobile-card"><h3>Próximos trabajos</h3><OrderList rows={home.active.slice(0,6)}/></section></>}
      {tab==='Producción'&&<section className="mobile-card mobile-full"><h2>Producción</h2><p className="mobile-muted">Órdenes activas y próximas entregas.</p><OrderList rows={home.active}/></section>}
      {tab==='Agenda'&&<section className="mobile-card mobile-full"><h2>Agenda</h2>{data.agenda.length?data.agenda.map(x=><div className="mobile-row" key={x.id}><div><strong>{x.title}</strong><small>{new Date(x.scheduled_start).toLocaleString('es-SV')} · {x.event_type}</small></div><span>{x.priority||'NORMAL'}</span></div>):<div className="mobile-empty">No hay actividades próximas.</div>}</section>}
      {tab==='Clientes'&&<section className="mobile-card mobile-full"><h2>Clientes</h2>{data.clients.length?data.clients.map(x=><div className="mobile-row" key={x.id}><div><strong>{x.name}</strong><small>{x.phone||x.email||'Sin contacto registrado'}</small></div><span>{x.status||'ACTIVO'}</span></div>):<div className="mobile-empty">No hay clientes registrados.</div>}</section>}
      {tab==='Cotizaciones'&&<section className="mobile-card mobile-full"><h2>Cotizaciones</h2>{data.quotes.length?data.quotes.map(x=><div className="mobile-row" key={x.id}><div><strong>COT-{x.number} · {x.clients?.name||'Cliente'}</strong><small>{money(x.total)} · válida hasta {x.valid_until||'—'}</small></div><span>{x.status}</span></div>):<div className="mobile-empty">No hay cotizaciones registradas.</div>}</section>}
    </>}</main>
    <nav className="mobile-bottom-nav">{['Inicio','Producción','Agenda','Clientes','Cotizaciones'].map(name=><button type="button" key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><span>{name==='Inicio'?'⌂':name==='Producción'?'▣':name==='Agenda'?'◷':name==='Clientes'?'◎':'$'}</span><small>{name}</small></button>)}</nav>
  </div>,document.body)
}

function Kpi({t,v}){return <article><strong>{v}</strong><span>{t}</span></article>}
function OrderList({rows}){return rows.length?rows.map(x=><div className="mobile-row" key={x.id}><div><strong>OT-{x.number} · {x.clients?.name||'Cliente'}</strong><small>{x.title} · {x.due_at?new Date(x.due_at).toLocaleDateString('es-SV'):'Sin fecha'}</small></div><span>{x.status}</span></div>):<div className="mobile-empty">No hay órdenes activas.</div>}
