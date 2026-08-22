import { useEffect,useMemo,useState } from 'react'

const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)
const addDays=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
const balance=r=>Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0))
const open=r=>!['PAID','CANCELLED'].includes(r.status)
const go=name=>[...document.querySelectorAll('.idealo-main-menu-item')].find(b=>b.textContent.trim()===name)?.click()

export default function DashboardOwnerDailyControl({company,supabase}){
 const [data,setData]=useState({quotes:[],orders:[],ar:[],ap:[],inventory:[],moves:[],products:[]})
 const [loading,setLoading]=useState(true)
 useEffect(()=>{let alive=true;(async()=>{
  setLoading(true)
  const start=`${new Date().toISOString().slice(0,7)}-01T00:00:00`
  const r=await Promise.all([
   supabase.from('quotes').select('id,number,status,total,valid_until,created_at,client_id,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}),
   supabase.from('work_orders').select('id,number,title,total,status,priority,due_at,created_at,client_id,clients(name)').eq('company_id',company.id).order('due_at',{ascending:true}),
   supabase.from('accounts_receivable').select('id,number,amount_total,amount_paid,status,due_date,client_id,clients(name)').eq('company_id',company.id),
   supabase.from('accounts_payable').select('id,number,amount_total,amount_paid,status,due_date,supplier_id,suppliers(name)').eq('company_id',company.id),
   supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit,average_cost').eq('company_id',company.id).eq('active',true),
   supabase.from('inventory_movements').select('id,inventory_item_id,movement_type,quantity,created_at').eq('company_id',company.id).gte('created_at',start),
   supabase.from('finished_products').select('id,name,category,sale_price').eq('company_id',company.id).eq('active',true)
  ])
  if(alive)setData({quotes:r[0].data||[],orders:r[1].data||[],ar:r[2].data||[],ap:r[3].data||[],inventory:r[4].data||[],moves:r[5].data||[],products:r[6].data||[]})
  if(alive)setLoading(false)
 })();return()=>{alive=false}},[company.id,supabase])

 const control=useMemo(()=>{
  const now=today(),soon=addDays(3)
  const quoteLeads=data.quotes.filter(q=>['DRAFT','SENT'].includes(q.status)&&(!q.valid_until||q.valid_until>=now)).map(q=>({
   title:q.clients?.name||`Cotización #${q.number}`,
   detail:`Cotización ${money(q.total)}${q.valid_until?` · vence ${q.valid_until}`:''}`,
   score:Number(q.total||0)+(q.valid_until&&q.valid_until<=soon?500:0)
  })).sort((a,b)=>b.score-a.score).slice(0,5)

  const collect=data.ar.filter(r=>open(r)&&balance(r)>0).map(r=>{
   const overdue=r.due_date&&r.due_date<now
   const dueSoon=r.due_date&&r.due_date<=addDays(7)
   return {title:r.clients?.name||'Cliente',detail:`${money(balance(r))}${r.due_date?` · vence ${r.due_date}`:''}`,score:balance(r)+(overdue?5000:dueSoon?1500:0),overdue}
  }).sort((a,b)=>b.score-a.score).slice(0,5)

  const pay=data.ap.filter(r=>open(r)&&balance(r)>0).map(r=>{
   const overdue=r.due_date&&r.due_date<now
   const dueSoon=r.due_date&&r.due_date<=addDays(7)
   return {title:r.suppliers?.name||'Proveedor',detail:`${money(balance(r))}${r.due_date?` · vence ${r.due_date}`:''}`,score:(overdue?5000:dueSoon?1500:0)+balance(r),overdue}
  }).sort((a,b)=>b.score-a.score).slice(0,5)

  const produce=data.orders.filter(o=>!['DELIVERED','CANCELLED'].includes(o.status)).map(o=>{
   const overdue=o.due_at&&new Date(o.due_at)<new Date()
   const dueSoon=o.due_at&&new Date(o.due_at)<new Date(Date.now()+72*3600000)
   const priority=['URGENT','HIGH'].includes(o.priority)
   const score=(overdue?10000:dueSoon?4000:0)+(priority?2500:0)+Number(o.total||0)
   return {title:`OT-${String(o.number).padStart(5,'0')} · ${o.clients?.name||'Cliente'}`,detail:`${o.title} · ${o.status}${o.due_at?` · entrega ${o.due_at.slice(0,10)}`:''}`,score,overdue}
  }).sort((a,b)=>b.score-a.score).slice(0,5)

  const days=Math.max(1,new Date().getDate()),used={}
  data.moves.filter(m=>m.movement_type==='CONSUMPTION').forEach(m=>used[m.inventory_item_id]=(used[m.inventory_item_id]||0)+Number(m.quantity||0))
  const buy=data.inventory.map(i=>{
   const daily=(used[i.id]||0)/days
   const daysLeft=daily>0?Number(i.current_stock||0)/daily:null
   const below=Number(i.current_stock||0)<=Number(i.minimum_stock||0)
   const target=Math.max(Number(i.minimum_stock||0)*2,daily*21)
   const qty=Math.max(0,target-Number(i.current_stock||0))
   return {...i,daysLeft,qty,score:(below?10000:daysLeft!==null&&daysLeft<14?5000:0)+(14-(daysLeft??14))*100}
  }).filter(i=>i.score>0).sort((a,b)=>b.score-a.score).slice(0,5)

  const cards=[
   {key:'sell',label:'Qué vender',module:'Cotizaciones',count:quoteLeads.length,summary:quoteLeads.length?'Dar seguimiento a cotizaciones abiertas':'Sin oportunidades urgentes',rows:quoteLeads},
   {key:'collect',label:'Qué cobrar',module:'Caja',count:collect.length,summary:collect.length?`${collect.filter(x=>x.overdue).length} cobro(s) vencido(s)`:'Cartera al día',rows:collect},
   {key:'pay',label:'Qué pagar',module:'Compras',count:pay.length,summary:pay.length?`${pay.filter(x=>x.overdue).length} pago(s) vencido(s)`:'Sin pagos prioritarios',rows:pay},
   {key:'produce',label:'Qué producir primero',module:'Producción',count:produce.length,summary:produce.length?`${produce.filter(x=>x.overdue).length} OT vencida(s)`:'Sin órdenes críticas',rows:produce},
   {key:'buy',label:'Qué comprar hoy',module:'Compras',count:buy.length,summary:buy.length?'Materiales con riesgo de faltante':'Inventario sin urgencias',rows:buy.map(i=>({title:i.name,detail:`Stock ${i.current_stock} ${i.unit} · ${i.daysLeft===null?'sin consumo reciente':`${i.daysLeft.toFixed(1)} días restantes`}${i.qty>0?` · sugerido ${i.qty.toFixed(1)} ${i.unit}`:''}`}))}
  ]
  return cards
 },[data])

 if(loading)return <section className="owner-daily panel"><strong>Preparando control diario del propietario…</strong></section>
 return <section className="owner-daily">
  <div className="owner-daily-head"><div><p className="form-kicker">CONTROL DIARIO DEL PROPIETARIO</p><h2>Las 5 decisiones de hoy</h2><p>Prioridades calculadas con ventas, cartera, proveedores, producción e inventario.</p></div><span>{new Date().toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long'})}</span></div>
  <div className="owner-daily-grid">{control.map(card=><article className={`owner-action ${card.key}`} key={card.key}>
   <header><div><small>{card.label}</small><strong>{card.summary}</strong></div><b>{card.count}</b></header>
   <div className="owner-action-list">{card.rows.length?card.rows.map((r,i)=><div key={`${card.key}-${i}`}><span>{r.title}</span><small>{r.detail}</small></div>):<div className="owner-action-empty">No hay acciones urgentes en esta categoría.</div>}</div>
   <button type="button" onClick={()=>go(card.module)}>Abrir {card.module}</button>
  </article>)}</div>
 </section>
}
