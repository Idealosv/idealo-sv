import { useMemo, useState } from 'react'

const GUIDES=[
 {
  id:'investor',
  title:'Registrar un inversionista',
  summary:'Crear el expediente personal y documental.',
  steps:[
   'Entrá a Inversionistas y seleccioná Nuevo expediente.',
   'Completá nombres, apellidos, DUI y la información disponible.',
   'Tomá o cargá foto del rostro y DUI frente/reverso.',
   'Si usás OCR del DUI, revisá la información antes de confirmarla.',
   'Guardá el expediente y verificá que aparezca como Activo.',
  ],
 },
 {
  id:'application',
  title:'Registrar una solicitud',
  summary:'Capturar monto y plazo solicitado para revisión.',
  steps:[
   'Abrí Solicitudes y elegí un inversionista activo.',
   'Ingresá monto, plazo, fecha solicitada y referencias de pago.',
   'Guardá la solicitud.',
   'Propietario o Administrador revisa y aprueba o rechaza.',
   'Si se aprueba, completá Firma y Fondos recibidos antes de formalizar.',
  ],
 },
 {
  id:'investment',
  title:'Formalizar una inversión',
  summary:'Convertir fondos recibidos en una inversión activa.',
  steps:[
   'Entrá a Inversiones desde una solicitud con Fondos recibidos.',
   'Confirmá fecha de otorgamiento y tasa anual 10%, 12% o 15%.',
   'Revisá capital, plazo y vencimiento calculado.',
   'Guardá la formalización.',
   'Prepará el contrato y archivá el documento firmado.',
  ],
 },
 {
  id:'payment',
  title:'Registrar un pago',
  summary:'Guardar rendimientos o devolución de capital.',
  steps:[
   'Abrí Rendimientos y seleccioná la inversión correcta.',
   'Elegí Rendimiento, Devolución de capital o Ajuste.',
   'Ingresá monto, fecha, forma, lugar y referencia.',
   'Guardá el movimiento.',
   'Si hay un error, no lo borres: Propietario o Administrador debe revertirlo con motivo.',
  ],
 },
 {
  id:'renewal',
  title:'Gestionar una renovación',
  summary:'Decidir continuidad o retiro al vencimiento.',
  steps:[
   'Abrí Vencimientos o Agenda y seleccioná la inversión.',
   'Entrá a Renovaciones y registrá la decisión.',
   'Si renueva, confirmá monto, plazo y referencias.',
   'Al vencimiento, Propietario o Administrador ejecuta la renovación.',
   'Si retira, registrá primero la devolución completa del capital y luego finalizá el retiro.',
  ],
 },
 {
  id:'closeout',
  title:'Generar cierre mensual',
  summary:'Crear un snapshot de la actividad del mes.',
  steps:[
   'Entrá a Cierre mensual.',
   'Elegí el mes y agregá una nota si es necesario.',
   'Generá el cierre.',
   'Revisá inversiones, pagos, vencimientos, renovaciones y contratos firmados.',
   'Si necesitás una nueva fotografía del mismo mes, generá otra versión; la anterior se conserva.',
  ],
 },
]

const QUIZ=[
 ['¿Quién puede aprobar o rechazar solicitudes?','Propietario o Administrador.'],
 ['¿Se puede borrar un pago equivocado?','No. Se revierte con motivo para conservar trazabilidad.'],
 ['¿Qué significa 10%, 12% o 15%?','Son tasas anuales confirmadas.'],
 ['¿El sistema calcula automáticamente plazos distintos de 12 meses?','No, hasta conocer la regla real de prorrateo/capitalización.'],
 ['¿Una notificación archivada cambia una inversión?','No. Solo cambia el estado personal de la notificación.'],
]

export default function PrestaditosHelpPanel({onGo}){
 const [selected,setSelected]=useState(GUIDES[0].id)
 const [training,setTraining]=useState(false)
 const [checked,setChecked]=useState({})
 const guide=GUIDES.find(x=>x.id===selected)||GUIDES[0]
 const completed=guide.steps.filter((_,i)=>checked[guide.id+'-'+i]).length
 const progress=Math.round((completed/guide.steps.length)*100)
 const related={
  investor:'Inversionistas',
  application:'Solicitudes',
  investment:'Inversiones',
  payment:'Rendimientos',
  renewal:'Renovaciones',
  closeout:'Cierre mensual',
 }[guide.id]
 const quizCount=useMemo(()=>QUIZ.length,[])

 return <section className="prst-help-module">
  <section className="prst-investor-summary prst-help-summary">
   <article><span>Guías</span><strong>{GUIDES.length}</strong><small>procesos principales</small></article>
   <article><span>Modo capacitación</span><strong>{training?'Activo':'Inactivo'}</strong><small>checklist paso a paso</small></article>
   <article><span>Preguntas rápidas</span><strong>{quizCount}</strong><small>reglas importantes</small></article>
   <article><span>Avance de guía</span><strong>{training?progress+'%':'—'}</strong><small>{training?completed+' de '+guide.steps.length:'activá capacitación'}</small></article>
  </section>

  <section className="prst-grid help-layout">
   <article className="prst-card prst-help-menu">
    <div className="prst-card-head"><div><small>AYUDA INTERNA</small><h2>Manual de operación</h2><p>Guías breves para trabajar Prestadito$ sin salir del ERP.</p></div></div>
    <div className="prst-help-guide-list">{GUIDES.map(row=><button key={row.id} type="button" className={selected===row.id?'active':''} onClick={()=>{setSelected(row.id);setChecked({})}}><strong>{row.title}</strong><small>{row.summary}</small></button>)}</div>
   </article>

   <article className="prst-card prst-help-guide">
    <div className="prst-card-head">
     <div><small>GUÍA PASO A PASO</small><h2>{guide.title}</h2><p>{guide.summary}</p></div>
     <button type="button" className="prst-report-export" onClick={()=>{setTraining(value=>!value);setChecked({})}}>{training?'Salir de capacitación':'Modo capacitación'}</button>
    </div>

    <div className="prst-training-steps">{guide.steps.map((step,index)=>{
     const key=guide.id+'-'+index
     const done=!!checked[key]
     return <label key={key} className={done?'done':''}>
      {training?<input type="checkbox" checked={done} onChange={e=>setChecked(current=>({...current,[key]:e.target.checked}))}/>:<span>{index+1}</span>}
      <div><b>{step}</b>{training&&<small>{done?'Completado':'Pendiente'}</small>}</div>
     </label>
    })}</div>

    {training&&<div className="prst-training-progress"><div><i style={{width:progress+'%'}}/></div><span>{progress}% completado</span></div>}

    <div className="prst-modal-actions"><button type="button" className="primary" onClick={()=>onGo?.(related)}>Abrir {related}</button></div>
   </article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>REGLAS QUE NO DEBEMOS OLVIDAR</small><h2>Preguntas rápidas</h2></div></div>
   <div className="prst-help-faq">{QUIZ.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
   <div className="prst-note"><strong>Datos todavía pendientes:</strong> los rangos de monto son provisionales, falta la regla para plazos distintos de 12 meses y falta el contrato legal definitivo. El manual no presenta esos puntos como reglas cerradas.</div>
  </article>
 </section>
}
