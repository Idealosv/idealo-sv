import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './assistant-ai.css'

const money=(v)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const iso=(d=new Date())=>d.toISOString().slice(0,10)
const monthStart=()=>`${iso().slice(0,7)}-01`
const addDays=(date,n)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return iso(d)}
const balance=(r)=>Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0))
const openRow=(r)=>!['PAID','CANCELLED'].includes(String(r.status||'').toUpperCase())
const norm=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')

const QUICK=[
  '¿Qué requiere mi atención hoy?',
  'Dame un diagnóstico completo de la empresa.',
  '¿Cómo está mi caja y qué riesgos ves?',
  '¿Qué cuentas debo cobrar primero?',
  '¿Qué proveedores debo pagar primero?',
  '¿Qué materiales debo reponer?',
  '¿Qué órdenes están atrasadas?',
  '¿Hay alguna inconsistencia entre DTE y Finanzas?',
  '¿Cómo va el flujo de caja de este mes?'
]

export default function AssistantLauncher(){
  const [open,setOpen]=useState(false),[session,setSession]=useState(null),[company,setCompany]=useState(null)
  const [context,setContext]=useState(null),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[loading,setLoading]=useState(false),[sending,setSending]=useState(false),[message,setMessage]=useState('')

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{const fn=e=>{if((e.detail||{}).target==='assistant')setOpen(true)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
  useEffect(()=>{if(!session||!supabase)return;supabase.rpc('get_my_companies').then(({data})=>setCompany(data?.[0]||null))},[session])

  const loadContext=async()=>{
    if(!company?.id)return
    setLoading(true);setMessage('')
    const start=monthStart(),end=iso(),next7=addDays(end,7)
    const [fin,audit,ar,ap,orders,inventory,quotes,clients]=await Promise.all([
      supabase.rpc('financial_dashboard_snapshot',{p_company:company.id,p_start:start,p_end:end}),
      supabase.rpc('audit_dte_financial_integrity',{p_company:company.id}),
      supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,clients(name)').eq('company_id',company.id).order('due_date',{ascending:true}).limit(200),
      supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,suppliers(name)').eq('company_id',company.id).order('due_date',{ascending:true}).limit(200),
      supabase.from('work_orders').select('id,number,title,status,priority,due_at,clients(name)').eq('company_id',company.id).order('due_at',{ascending:true}).limit(200),
      supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit').eq('company_id',company.id).eq('active',true).limit(500),
      supabase.from('quotes').select('id,code,status,title,total,valid_until,created_at,clients(name)').eq('company_id',company.id).is('soft_deleted_at',null).order('created_at',{ascending:false}).limit(300),
      supabase.from('clients').select('id,name,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(300)
    ])
    const err=[fin,audit,ar,ap,orders,inventory,quotes,clients].find(x=>x.error)?.error
    if(err){setMessage(err.message);setLoading(false);return}
    const today=iso()
    const ctx={finance:fin.data||{},audit:audit.data||[],ar:ar.data||[],ap:ap.data||[],orders:orders.data||[],inventory:inventory.data||[],quotes:quotes.data||[],clients:clients.data||[],today,next7}
    setContext(ctx);setLoading(false)
    return ctx
  }

  useEffect(()=>{if(open&&company?.id)loadContext()},[open,company?.id])

  const metrics=useMemo(()=>{
    if(!context)return {}
    const f=context.finance||{}
    const overdueAr=context.ar.filter(r=>openRow(r)&&r.due_date&&r.due_date<context.today)
    const overdueAp=context.ap.filter(r=>openRow(r)&&r.due_date&&r.due_date<context.today)
    const lateOrders=context.orders.filter(o=>o.due_at&&o.due_at.slice(0,10)<context.today&&!['DELIVERED','COMPLETED','CANCELLED'].includes(String(o.status||'').toUpperCase()))
    const lowStock=context.inventory.filter(i=>Number(i.current_stock||0)<=Number(i.minimum_stock||0))
    const expiringQuotes=context.quotes.filter(q=>q.valid_until&&q.valid_until>=context.today&&q.valid_until<=context.next7&&!['APPROVED','ACCEPTED','REJECTED','CANCELLED','CLOSED'].includes(String(q.status||'').toUpperCase()))
    const integrityErrors=context.audit.filter(x=>String(x.severity).toUpperCase()==='ERROR'&&Number(x.affected||0)>0)
    let health=100;if(Number(f.cash_total||0)<0)health-=25;if(overdueAr.length)health-=Math.min(20,overdueAr.length*4);if(overdueAp.length&&Number(f.payables_overdue||0)>Math.max(Number(f.cash_total||0),0))health-=15;if(lateOrders.length)health-=Math.min(20,lateOrders.length*3);if(lowStock.length)health-=Math.min(10,lowStock.length);if(integrityErrors.length)health-=25
    return {...f,overdueAr,overdueAp,lateOrders,lowStock,expiringQuotes,integrityErrors,health_score:Math.max(0,Math.round(health))}
  },[context])

  const priorities=useMemo(()=>{
    const list=[]
    if(metrics.integrityErrors?.length)list.push({title:`${metrics.integrityErrors.length} inconsistencia(s) DTE ↔ Finanzas`,target:'billing'})
    if(Number(metrics.receivables_overdue)>0)list.push({title:`CxC vencida ${money(metrics.receivables_overdue)}`,target:'billing'})
    if(metrics.lateOrders?.length)list.push({title:`${metrics.lateOrders.length} órdenes atrasadas`,target:'planning'})
    if(Number(metrics.payables_overdue)>0)list.push({title:`CxP vencida ${money(metrics.payables_overdue)}`,target:'procurement'})
    if(metrics.lowStock?.length)list.push({title:`${metrics.lowStock.length} materiales en mínimo`,target:'inventory'})
    if(metrics.expiringQuotes?.length)list.push({title:`${metrics.expiringQuotes.length} cotizaciones por vencer`,target:'quotes'})
    return list
  },[metrics])

  const answer=(text,ctx)=>{
    const q=norm(text),m=metrics
    if(q.includes('inconsistencia')||q.includes('dte')&&q.includes('finanz')){
      if(!m.integrityErrors?.length)return 'La auditoría DTE ↔ Finanzas está limpia: no detecto inconsistencias activas en los controles críticos.'
      return `Detecto ${m.integrityErrors.length} inconsistencia(s):\n${m.integrityErrors.map(x=>`• ${x.code}: ${x.affected} caso(s)`).join('\n')}`
    }
    if(q.includes('cobrar')||q.includes('cxc')||q.includes('me deben')){
      const rows=m.overdueAr||[]
      if(!rows.length)return `No hay cuentas por cobrar vencidas. Saldo total pendiente: ${money(m.receivables)}.`
      return `Hay ${rows.length} cuenta(s) vencida(s) por ${money(m.receivables_overdue)}. Priorizá:\n${rows.slice(0,6).map((r,i)=>`${i+1}. ${r.clients?.name||'Cliente'} · ${money(balance(r))} · venció ${r.due_date}`).join('\n')}`
    }
    if(q.includes('proveedor')||q.includes('pagar')||q.includes('cxp')){
      const rows=m.overdueAp||[]
      if(!rows.length)return `No hay cuentas por pagar vencidas. Saldo total pendiente: ${money(m.payables)}.`
      return `Hay ${rows.length} obligación(es) vencida(s) por ${money(m.payables_overdue)}. Priorizá:\n${rows.slice(0,6).map((r,i)=>`${i+1}. ${r.suppliers?.name||'Proveedor'} · ${money(balance(r))} · venció ${r.due_date}`).join('\n')}`
    }
    if(q.includes('caja')||q.includes('flujo')||q.includes('liquidez')||q.includes('dinero')){
      return `Disponible actual: ${money(m.cash_total)} (Caja ${money(m.cash_available)} · Banco ${money(m.bank_available)}). Este mes entraron ${money(m.cash_in)} y salieron ${money(m.cash_out)}, con flujo neto de ${money(m.net_cash)}. CxC pendiente ${money(m.receivables)} y CxP pendiente ${money(m.payables)}.`
    }
    if(q.includes('material')||q.includes('inventario')||q.includes('stock')||q.includes('reponer')){
      if(!m.lowStock?.length)return 'No detecto materiales en o por debajo del stock mínimo.'
      return `Hay ${m.lowStock.length} material(es) en nivel mínimo:\n${m.lowStock.slice(0,8).map((r,i)=>`${i+1}. ${r.name}: ${r.current_stock||0} ${r.unit||''} / mínimo ${r.minimum_stock||0}`).join('\n')}`
    }
    if(q.includes('orden')||q.includes('atras')||q.includes('produccion')){
      if(!m.lateOrders?.length)return 'No detecto órdenes de trabajo vencidas pendientes.'
      return `Hay ${m.lateOrders.length} orden(es) atrasada(s):\n${m.lateOrders.slice(0,8).map((r,i)=>`${i+1}. OT-${String(r.number).padStart(5,'0')} · ${r.clients?.name||'Cliente'} · ${r.title||''} · venció ${String(r.due_at).slice(0,10)}`).join('\n')}`
    }
    if(q.includes('cotizacion')||q.includes('cotizaciones')){
      const month=ctx.quotes.filter(r=>String(r.created_at||'').slice(0,7)===iso().slice(0,7))
      const total=month.reduce((s,r)=>s+Number(r.total||0),0)
      return `Este mes hay ${month.length} cotización(es) por ${money(total)}. ${m.expiringQuotes?.length||0} vencen en los próximos 7 días.${m.expiringQuotes?.length?`\n${m.expiringQuotes.slice(0,5).map(r=>`• ${r.code||'Cotización'} · ${r.clients?.name||'Cliente'} · ${money(r.total)} · vence ${r.valid_until}`).join('\n')}`:''}`
    }
    return `Diagnóstico actual de ${company?.name||'la empresa'}:\n• Salud IDEALO: ${m.health_score}/100\n• Disponible: ${money(m.cash_total)}\n• Flujo neto del mes: ${money(m.net_cash)}\n• CxC: ${money(m.receivables)} (${money(m.receivables_overdue)} vencido)\n• CxP: ${money(m.payables)} (${money(m.payables_overdue)} vencido)\n• Compras: ${money(m.purchases_period)}\n• Gastos: ${money(m.expenses_period)}\n• DTE producción aceptados: ${m.accepted_dte_count||0} por ${money(m.accepted_dte_total)}\n• Anticipos pendientes: ${money(m.pending_advances)}\n• OT atrasadas: ${m.lateOrders?.length||0}\n• Stock crítico: ${m.lowStock?.length||0}\n• Inconsistencias DTE ↔ Finanzas: ${m.integrityErrors?.length||0}`
  }

  const send=async(preset)=>{
    const text=String(preset||question).trim();if(!text||sending||!company?.id)return
    setMessages(v=>[...v,{role:'user',content:text}]);setQuestion('');setSending(true);setMessage('')
    try{const ctx=context||await loadContext();if(!ctx)throw new Error('No se pudo cargar el contexto del ERP.');setMessages(v=>[...v,{role:'assistant',content:answer(text,ctx)}])}catch(e){setMessages(v=>[...v,{role:'assistant',content:`No pude completar el análisis: ${e.message}`}])}finally{setSending(false)}
  }

  const go=(target)=>{setOpen(false);window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target}}))}
  if(!open)return null

  return <div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Asistente Inteligente" onMouseDown={e=>e.stopPropagation()}>
    <header className="erp-modal-head"><div><strong>IDEALO INTELIGENTE V3</strong><small>Motor interno conectado directamente a Caja, Finanzas, CxC, CxP, DTE, Inventario y Producción</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
    <div className="erp-modal-body">{message&&<p className="feedback error">{message}</p>}{loading?<div className="empty-state"><strong>Analizando datos reales del ERP…</strong><p>Sin servicios externos ni consumo de API.</p></div>:<div className="ai-shell">
      <section className="panel ai-chat"><div className="ai-status-line"><div><p className="form-kicker">ASISTENTE EMPRESARIAL</p><h2>Preguntale a tu ERP</h2></div><span className="status dte-ready">Datos reales · lectura segura</span></div>
        <div className="ai-quick">{QUICK.map(t=><button type="button" key={t} disabled={sending} onClick={()=>send(t)}>{t}</button>)}</div>
        <div className="ai-chat-stream" aria-live="polite">{!messages.length&&<div className="ai-empty-chat"><strong>Listo para analizar tu empresa.</strong><p>Las respuestas salen directamente de los registros actuales de IDEALO SV.</p></div>}{messages.map((x,i)=><article key={`${x.role}-${i}`} className={`ai-message ${x.role}`}><small>{x.role==='user'?'Vos':'IDEALO'}</small>{x.content}</article>)}{sending&&<article className="ai-message assistant"><small>IDEALO</small>Consultando datos actuales…</article>}</div>
        <div className="ai-composer"><textarea value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ejemplo: ¿qué debo atender primero hoy?" disabled={sending}/><button type="button" onClick={()=>send()} disabled={sending||!question.trim()}>{sending?'Analizando…':'Preguntar'}</button></div>
      </section>
      <aside className="ai-side"><section className="panel"><p className="form-kicker">RADAR EMPRESARIAL</p><h3>Situación actual</h3><div className="ai-metric-list">
        <article><small>Salud empresarial</small><strong>{metrics.health_score??100}/100</strong></article><article><small>Disponible</small><strong>{money(metrics.cash_total)}</strong></article><article><small>Flujo neto mes</small><strong>{money(metrics.net_cash)}</strong></article><article><small>CxC</small><strong>{money(metrics.receivables)}</strong></article><article><small>CxP</small><strong>{money(metrics.payables)}</strong></article><article><small>DTE producción</small><strong>{money(metrics.accepted_dte_total)}</strong></article><article><small>OT atrasadas</small><strong>{metrics.lateOrders?.length||0}</strong></article><article><small>Stock crítico</small><strong>{metrics.lowStock?.length||0}</strong></article>
      </div></section>
      <section className="panel"><p className="form-kicker">PRIORIDADES</p><h3>Qué requiere atención</h3><div className="schedule-list">{priorities.map(x=><article className="schedule-card" key={x.title}><div><strong>{x.title}</strong></div><button type="button" className="secondary-button" onClick={()=>go(x.target)}>Abrir</button></article>)}{!priorities.length&&<div className="empty-state"><strong>Sin alertas críticas</strong></div>}</div></section>
      <section className="panel"><div className="ai-readonly"><strong>Motor interno IDEALO SV.</strong><br/>No usa OpenAI ni servicios externos, no genera costo por consulta y no modifica registros automáticamente.</div></section></aside>
    </div>}</div>
  </section></div>
}
