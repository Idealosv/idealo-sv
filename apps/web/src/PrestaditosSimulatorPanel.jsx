import React from 'react'
import { ANNUAL_RATE_EXAMPLE_TIERS, RETURN_RATES, annualReferenceGain, suggestedAnnualRate, tierForAmount } from './prestaditos-rate-rules.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const today=()=>new Date().toISOString().slice(0,10)
const addMonths=(dateValue,months)=>{
 const base=new Date((dateValue||today())+'T12:00:00')
 const day=base.getDate()
 base.setDate(1)
 base.setMonth(base.getMonth()+Number(months||0))
 const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate()
 base.setDate(Math.min(day,last))
 return base.toISOString().slice(0,10)
}
const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'long',year:'numeric'}):'—'

export default function PrestaditosSimulatorPanel({settings}){
 const termOptions=Array.isArray(settings?.allowed_term_months)&&settings.allowed_term_months.length?settings.allowed_term_months:[6,12,18]
 const [amount,setAmount]=React.useState('5000')
 const [term,setTerm]=React.useState(String(termOptions.includes(12)?12:termOptions[0]||12))
 const [startDate,setStartDate]=React.useState(today())
 const suggested=suggestedAnnualRate(amount)
 const [rate,setRate]=React.useState(String(suggested||12))

 React.useEffect(()=>{
  const next=suggestedAnnualRate(amount)
  if(next)setRate(String(next))
 },[amount])

 const principal=Number(amount||0)
 const months=Number(term||0)
 const annualGain=annualReferenceGain(principal,Number(rate))
 const selectedPeriodGain=months===12?annualGain:null
 const maturity=principal>0&&months>0?addMonths(startDate,months):''
 const tier=tierForAmount(principal)
 const total12=annualGain===null?null:principal+annualGain

 return <section className="prst-simulator-module">
  <section className="prst-investor-summary prst-simulator-summary">
   <article><span>Monto simulado</span><strong>{money(principal)}</strong><small>capital de referencia</small></article>
   <article><span>Tasa anual</span><strong>{rate?rate+'%':'—'}</strong><small>{tier?'sugerida por rango provisional':'selección manual'}</small></article>
   <article><span>Referencia anual</span><strong>{annualGain===null?'—':money(annualGain)}</strong><small>capital × tasa anual</small></article>
   <article><span>Vencimiento</span><strong>{date(maturity)}</strong><small>{months?months+' meses':'sin plazo'}</small></article>
  </section>

  <section className="prst-grid form-list">
   <article className="prst-card prst-form">
    <div className="prst-card-head"><div><small>SIMULADOR</small><h2>Simular una inversión</h2><p>Herramienta de referencia con las tasas anuales conocidas hasta ahora.</p></div></div>

    <div className="prst-form-grid">
     <label className="prst-field"><span>Monto a invertir</span><input type="number" min="1" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label className="prst-field"><span>Plazo</span><div className="prst-input-suffix"><input type="number" min="1" max="240" step="1" list="prst-simulator-term-options" value={term} onChange={e=>setTerm(e.target.value)}/><span>meses</span></div></label>
     <label className="prst-field"><span>Fecha de inicio</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
     <label className="prst-field"><span>Tasa anual</span><select value={rate} onChange={e=>setRate(e.target.value)}>{RETURN_RATES.map(value=><option key={value} value={value}>{value}% anual</option>)}</select></label>
    </div>
    <datalist id="prst-simulator-term-options">{termOptions.map(value=><option key={value} value={value}/>)}</datalist>

    <div className="prst-rate-reference">
     <span><b>Ganancia anual de referencia</b><strong>{annualGain===null?'—':money(annualGain)}</strong></span>
     <span><b>Total de referencia a 12 meses</b><strong>{total12===null?'—':money(total12)}</strong></span>
     <span><b>Ganancia del plazo seleccionado</b><strong>{selectedPeriodGain===null?'Pendiente de regla':money(selectedPeriodGain)}</strong></span>
     <span><b>Fecha de vencimiento</b><strong>{date(maturity)}</strong></span>
     <small>{months===12?'Para 12 meses, la referencia anual coincide con el plazo simulado.':'Para plazos distintos de 12 meses no calculamos automáticamente la ganancia del período hasta que Prestadito$ confirme la regla de prorrateo o capitalización.'}</small>
    </div>

    <div className="prst-note"><strong>Rangos provisionales:</strong> {tier?<>para {money(principal)} el sistema sugiere {tier.rate}% anual usando el rango de ejemplo {tier.label}.</>:<>el monto no entra en los ejemplos provisionales actuales.</>}</div>
   </article>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>EJEMPLOS TEMPORALES</small><h2>Tasas anuales por monto</h2><p>Estos rangos son de demostración y se reemplazarán cuando llegue la tabla real.</p></div></div>
    <div className="prst-simulator-examples">
     {ANNUAL_RATE_EXAMPLE_TIERS.map(row=>{
      const sample=row.rate===10?2000:row.rate===12?7500:15000
      return <article key={row.rate}><span>{row.label}</span><strong>{row.rate}% anual</strong><small>Ejemplo: {money(sample)} → {money(annualReferenceGain(sample,row.rate))} de referencia anual</small></article>
     })}
    </div>
    <div className="prst-note"><strong>No es una cotización ni contrato.</strong> El simulador no guarda información y no reemplaza la aprobación ni la formalización de una inversión.</div>
   </article>
  </section>
 </section>
}
