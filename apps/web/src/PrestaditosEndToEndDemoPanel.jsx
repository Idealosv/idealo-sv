import { useMemo, useState } from 'react'
import { PRESTADITOS_E2E_SCENARIOS, validatePrestaditosDemoScenario } from './prestaditos-demo-scenarios.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))

export default function PrestaditosEndToEndDemoPanel(){
 const [selectedId,setSelectedId]=useState(PRESTADITOS_E2E_SCENARIOS[0].id)
 const scenario=PRESTADITOS_E2E_SCENARIOS.find(x=>x.id===selectedId)||PRESTADITOS_E2E_SCENARIOS[0]
 const errors=useMemo(()=>validatePrestaditosDemoScenario(scenario),[scenario])
 const complete=scenario.path.filter(step=>step[2]==='DONE').length

 return <section className="prst-e2e-demo-module">
  <section className="prst-investor-summary prst-e2e-summary">
   <article><span>Casos ficticios</span><strong>3</strong><small>10%, 12% y 15% anual</small></article>
   <article><span>Pasos del caso</span><strong>{scenario.path.length}</strong><small>recorrido integral</small></article>
   <article><span>Completados</span><strong>{complete}</strong><small>validación de demostración</small></article>
   <article><span>Errores del escenario</span><strong>{errors.length}</strong><small>{errors.length?'revisar':'sin inconsistencias'}</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>PRUEBA INTEGRAL SIN COSTO</small><h2>Escenarios ficticios de Prestadito$</h2><p>Recorrido completo con datos locales de demostración. No escribe en Supabase ni modifica información real.</p></div></div>

   <div className="prst-e2e-tabs">{PRESTADITOS_E2E_SCENARIOS.map(row=><button key={row.id} type="button" className={row.id===selectedId?'active':''} onClick={()=>setSelectedId(row.id)}>{row.rate}% · {money(row.amount)}</button>)}</div>

   <div className="prst-profile-grid">
    <article><small>Inversionista ficticio</small><b>{scenario.investor.name}</b><span>{scenario.investor.code} · DUI {scenario.investor.dui}</span></article>
    <article><small>Capital</small><b>{money(scenario.amount)}</b><span>monto de demostración</span></article>
    <article><small>Tasa</small><b>{scenario.rate}% anual</b><span>12 meses</span></article>
    <article><small>Referencia anual</small><b>{money(scenario.annualReference)}</b><span>capital × tasa anual</span></article>
   </div>

   {errors.length>0&&<div className="prst-note"><strong>Inconsistencias del escenario:</strong> {errors.join(' ')}</div>}

   <div className="prst-e2e-flow">{scenario.path.map(([code,label,status],index)=><article key={code}>
    <span>{String(index+1).padStart(2,'0')}</span>
    <div><b>{label}</b><small>{code}</small></div>
    <strong>{status==='DONE'?'✓':'•'}</strong>
   </article>)}</div>

   <div className="prst-note"><strong>Importante:</strong> estos casos permiten revisar el recorrido funcional sin pagar una rama de base de datos. No sustituyen la prueba futura contra una base aislada antes de producción.</div>
  </article>
 </section>
}
