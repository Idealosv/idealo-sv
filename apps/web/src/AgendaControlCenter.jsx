import {useEffect,useMemo,useState} from 'react'

const dateKey=v=>String(v||'').slice(0,10)
const today=()=>new Date().toISOString().slice(0,10)
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
const fmtDate=v=>v?new Date(v).toLocaleDateString('es-SV',{weekday:'short',day:'2-digit',month:'short'}):'—'
const fmtTime=v=>v?new Date(v).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'}):''
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))

export default function AgendaControlCenter({company,supabase}){
 const [events,setEvents]=useState([]),[deliveries,setDeliveries]=useState([]),[orders,setOrders]=useState([]),[receivables,setReceivables]=useState([]),[msg,setMsg]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;(async()=>{setLoading(true);const r=await Promise.all([
  supabase.from('production_schedule_events').select('id,event_type,title,scheduled_start,status,priority,location').eq('company_id',company.id),
  supabase.from('deliveries').select('id,number,scheduled_at,status,delivery_method,delivery_address').eq('company_id',company.id).not('scheduled_at','is',null),
  supabase.from('work_orders').select('id,number,title,due_at,status,priority').eq('company_id',company.id),
  supabase.from('accounts_receivable').select('id,due_date,status,amount_total,amount_paid').eq('company_id',company.id)
 ]);if(!live)return;const e=r.find(x=>x.error)?.error;if(e)setMsg(e.message);else{setEvents(r[0].data||[]);setDeliveries(r[1].data||[]);setOrders(r[2].data||[]);setReceivables(r[3].data||[]);setMsg('')}setLoading(false)})();return()=>{live=false}},[company.id,supabase])

 const k=useMemo(()=>{const t=today(),next=addDays(7)
  const overdueOrders=orders.filter(x=>x.due_at&&dateKey(x.due_at)<t&&!['DELIVERED','COMPLETED','CANCELLED'].includes(x.status))
  const upcoming=events.filter(x=>dateKey(x.scheduled_start)>=t&&dateKey(x.scheduled_start)<=next&&!['COMPLETED','CANCELLED'].includes(x.status))
  const urgent=upcoming.filter(x=>x.priority==='URGENT')
  const deliveries7=deliveries.filter(x=>dateKey(x.scheduled_at)>=t&&dateKey(x.scheduled_at)<=next&&!['DELIVERED','CANCELLED'].includes(x.status))
  const collections=receivables.filter(x=>x.due_date&&x.due_date>=t&&x.due_date<=next&&!['PAID','CANCELLED'].includes(x.status))
  const overdueCollections=receivables.filter(x=>x.due_date&&x.due_date<t&&!['PAID','CANCELLED'].includes(x.status))
  const receivableAmount=collections.reduce((s,x)=>s+Math.max(0,Number(x.amount_total||0)-Number(x.amount_paid||0)),0)
  return{overdueOrders,upcoming,urgent,deliveries7,collections,overdueCollections,receivableAmount}
 },[events,deliveries,orders,receivables])

 const agenda=useMemo(()=>{
  const rows=[
   ...k.upcoming.map(x=>({id:`e-${x.id}`,date:x.scheduled_start,type:x.event_type||'ACTIVIDAD',title:x.title||'Actividad programada',meta:x.location||x.status,priority:x.priority})),
   ...k.deliveries7.map(x=>({id:`d-${x.id}`,date:x.scheduled_at,type:'ENTREGA',title:`Entrega ${x.number?`#${x.number}`:''}`.trim(),meta:[x.delivery_method,x.delivery_address].filter(Boolean).join(' · '),priority:'NORMAL'})),
   ...k.collections.map(x=>({id:`c-${x.id}`,date:`${x.due_date}T12:00:00`,type:'COBRO',title:`Cobro por ${money(Math.max(0,Number(x.amount_total||0)-Number(x.amount_paid||0)))}`,meta:'Cuenta por cobrar',priority:'NORMAL'}))
  ]
  return rows.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,8)
 },[k])

 const overdueTotal=k.overdueOrders.length+k.overdueCollections.length
 if(loading)return <section className="agenda-control agenda-loading"><span className="spinner"/><p>Cargando agenda…</p></section>
 return <section className="agenda-control">
  <div className="agenda-hero">
   <div><p className="form-kicker">CENTRO OPERATIVO</p><h2>Agenda de los próximos 7 días</h2><p>Producción, entregas, cobros y órdenes que necesitan atención.</p></div>
   <div className={`agenda-alert ${overdueTotal?'danger':'ok'}`}><strong>{overdueTotal}</strong><span>{overdueTotal===1?'pendiente vencido':'pendientes vencidos'}</span></div>
  </div>
  <div className="agenda-kpis">
   <article><span className="agenda-kpi-icon">●</span><div><small>Actividades</small><strong>{k.upcoming.length}</strong><em>{k.urgent.length} urgentes</em></div></article>
   <article><span className="agenda-kpi-icon">↗</span><div><small>Entregas</small><strong>{k.deliveries7.length}</strong><em>Próximos 7 días</em></div></article>
   <article><span className="agenda-kpi-icon">$</span><div><small>Cobros</small><strong>{k.collections.length}</strong><em>{money(k.receivableAmount)} por cobrar</em></div></article>
   <article><span className="agenda-kpi-icon">!</span><div><small>OT atrasadas</small><strong>{k.overdueOrders.length}</strong><em>Requieren atención</em></div></article>
  </div>
  <div className="agenda-focus-grid">
   <section className="agenda-next">
    <div className="agenda-section-head"><div><small>PRÓXIMAMENTE</small><h3>Lo que viene</h3></div><span>{agenda.length} elementos</span></div>
    <div className="agenda-list">{agenda.length?agenda.map(item=><article key={item.id} className={item.priority==='URGENT'?'urgent':''}>
      <div className="agenda-date"><strong>{fmtDate(item.date)}</strong><span>{fmtTime(item.date)}</span></div>
      <div className="agenda-item-main"><span className="agenda-type">{item.type}</span><strong>{item.title}</strong><small>{item.meta||'Sin detalle adicional'}</small></div>
     </article>):<div className="agenda-empty"><strong>Agenda despejada</strong><span>No hay actividades, entregas o cobros programados para los próximos 7 días.</span></div>}</div>
   </section>
   <aside className="agenda-attention">
    <div className="agenda-section-head"><div><small>ATENCIÓN</small><h3>Prioridades</h3></div></div>
    <div className="agenda-priority-row"><span>Urgentes</span><strong>{k.urgent.length}</strong></div>
    <div className="agenda-priority-row"><span>Cobros vencidos</span><strong>{k.overdueCollections.length}</strong></div>
    <div className="agenda-priority-row"><span>OT atrasadas</span><strong>{k.overdueOrders.length}</strong></div>
    <p>{overdueTotal?'Hay pendientes que requieren revisión antes de seguir planificando.':'No hay atrasos críticos. La operación está al día.'}</p>
   </aside>
  </div>
  {msg&&<p className="feedback error">{msg}</p>}
 </section>
}
