import { useMemo } from 'react'
import { ANNUAL_RATE_EXAMPLE_TIERS } from './prestaditos-rate-rules.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value||0))
const today=()=>new Date().toISOString().slice(0,10)
const daysUntil=value=>value?Math.ceil((new Date(String(value).slice(0,10)+'T12:00:00').getTime()-new Date(today()+'T12:00:00').getTime())/86400000):null
const monthKey=value=>String(value||'').slice(0,7)
const monthLabel=key=>{
 const [y,m]=key.split('-').map(Number)
 return new Date(y,m-1,1).toLocaleDateString('es-SV',{month:'short',year:'2-digit'})
}
const recentMonths=()=>{
 const now=new Date()
 return Array.from({length:6},(_,index)=>{
  const d=new Date(now.getFullYear(),now.getMonth()-(5-index),1)
  return d.toISOString().slice(0,7)
 })
}

function Bar({label,value,max,suffix='',hint=''}){const width=max>0?Math.max(3,Math.min(100,(Number(value||0)/max)*100)):0;return <div className="prst-exec-bar"><div><span>{label}</span><b>{suffix?Number(value||0)+suffix:money(value)}</b></div><div className="prst-exec-track"><i style={{width:width+'%'}}/></div>{hint&&<small>{hint}</small>}</div>}

export default function PrestaditosExecutiveAnalytics({investments,payments,applications}){
 const active=useMemo(()=>investments.filter(x=>!['CLOSED','CANCELLED','RENEWED'].includes(x.status)),[investments])
 const postedPayments=useMemo(()=>payments.filter(x=>(x.status||'POSTED')==='POSTED'),[payments])

 const rateRows=useMemo(()=>[10,12,15].map(rate=>{
  const rows=active.filter(x=>Number(x.agreed_return_rate)===rate)
  return {rate,count:rows.length,capital:rows.reduce((s,x)=>s+Number(x.principal||0),0)}
 }),[active])

 const tierRows=useMemo(()=>ANNUAL_RATE_EXAMPLE_TIERS.map(tier=>{
  const rows=active.filter(x=>{
   const amount=Number(x.principal||0)
   return amount>=tier.min&&(tier.max===null||amount<=tier.max)
  })
  return {label:tier.label,rate:tier.rate,count:rows.length,capital:rows.reduce((s,x)=>s+Number(x.principal||0),0)}
 }),[active])

 const maturity=useMemo(()=>{
  const buckets=[
   {label:'Vencidas',min:-Infinity,max:-1,count:0,capital:0},
   {label:'0–30 días',min:0,max:30,count:0,capital:0},
   {label:'31–90 días',min:31,max:90,count:0,capital:0},
   {label:'Más de 90 días',min:91,max:Infinity,count:0,capital:0},
  ]
  active.forEach(inv=>{
   const d=daysUntil(inv.maturity_date)
   if(d===null)return
   const bucket=buckets.find(x=>d>=x.min&&d<=x.max)
   if(bucket){bucket.count+=1;bucket.capital+=Number(inv.principal||0)}
  })
  return buckets
 },[active])

 const cashflow=useMemo(()=>recentMonths().map(month=>{
  const incoming=investments.filter(x=>x.status!=='CANCELLED'&&monthKey(x.granted_at)===month).reduce((s,x)=>s+Number(x.principal||0),0)
  const outgoing=postedPayments.filter(x=>monthKey(x.payment_date)===month).reduce((s,x)=>s+Number(x.amount||0),0)
  return {month,incoming,outgoing,net:incoming-outgoing}
 }),[investments,postedPayments])

 const maxRate=Math.max(1,...rateRows.map(x=>x.capital))
 const maxTier=Math.max(1,...tierRows.map(x=>x.capital))
 const maxMaturity=Math.max(1,...maturity.map(x=>x.capital))
 const maxFlow=Math.max(1,...cashflow.flatMap(x=>[x.incoming,x.outgoing]))
 const approvedPending=applications.filter(x=>['APPROVED','SIGNATURE','FUNDS_RECEIVED'].includes(x.status)).reduce((s,x)=>s+Number(x.approved_amount??x.requested_amount||0),0)

 return <section className="prst-executive-analytics">
  <div className="prst-grid two">
   <article className="prst-card">
    <div className="prst-card-head"><div><small>DISTRIBUCIÓN POR TASA</small><h2>Capital vigente por tasa anual</h2><p>10%, 12% y 15% sobre inversiones no cerradas, canceladas ni renovadas.</p></div></div>
    <div className="prst-exec-bars">{rateRows.map(row=><Bar key={row.rate} label={row.rate+'% anual'} value={row.capital} max={maxRate} hint={row.count+' inversión'+(row.count===1?'':'es')}/>)}</div>
   </article>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>RANGOS DE MONTO</small><h2>Capital por rango provisional</h2><p>Los límites son ejemplos temporales hasta recibir la tabla oficial.</p></div></div>
    <div className="prst-exec-bars">{tierRows.map(row=><Bar key={row.rate} label={row.label} value={row.capital} max={maxTier} hint={row.count+' inversión'+(row.count===1?'':'es')+' · '+row.rate+'% anual'}/>)}</div>
   </article>
  </div>

  <div className="prst-grid two">
   <article className="prst-card">
    <div className="prst-card-head"><div><small>VENCIMIENTOS</small><h2>Capital por ventana de vencimiento</h2></div></div>
    <div className="prst-exec-bars">{maturity.map(row=><Bar key={row.label} label={row.label} value={row.capital} max={maxMaturity} hint={row.count+' inversión'+(row.count===1?'':'es')}/>)}</div>
   </article>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>FLUJO 6 MESES</small><h2>Capital formalizado vs. salidas</h2><p>Salidas = pagos vigentes de rendimiento, capital y ajustes.</p></div></div>
    <div className="prst-flow-chart">{cashflow.map(row=><div key={row.month} className="prst-flow-month"><span>{monthLabel(row.month)}</span><div><i className="in" style={{height:Math.max(3,(row.incoming/maxFlow)*72)+'px'}} title={'Entrada '+money(row.incoming)}/><i className="out" style={{height:Math.max(3,(row.outgoing/maxFlow)*72)+'px'}} title={'Salida '+money(row.outgoing)}/></div><small>{money(row.net)}</small></div>)}</div>
    <div className="prst-flow-legend"><span><i className="in"/> Capital formalizado</span><span><i className="out"/> Salidas</span></div>
   </article>
  </div>

  <article className="prst-card prst-exec-foot">
   <div><span>Capital aprobado pendiente de completar</span><strong>{money(approvedPending)}</strong><small>Solicitudes aprobadas, en firma o con fondos recibidos.</small></div>
   <div><span>Inversiones vigentes analizadas</span><strong>{active.length}</strong><small>Base del tablero ejecutivo.</small></div>
  </article>
 </section>
}
