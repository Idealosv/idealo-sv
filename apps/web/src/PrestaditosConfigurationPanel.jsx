import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const normalized=value=>String(value||'').trim()
const uniqCaseInsensitive=values=>{
 const seen=new Set()
 return values.map(normalized).filter(Boolean).filter(value=>{const key=value.toLowerCase();if(seen.has(key))return false;seen.add(key);return true})
}

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}

export default function PrestaditosConfigurationPanel({company,role,settings,saving,act}){
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const [terms,setTerms]=useState([])
 const [termInput,setTermInput]=useState('')
 const [methods,setMethods]=useState([])
 const [methodInput,setMethodInput]=useState('')
 const [places,setPlaces]=useState([])
 const [placeInput,setPlaceInput]=useState('')
 const [notes,setNotes]=useState('')

 useEffect(()=>{
  setTerms(Array.isArray(settings?.allowed_term_months)?settings.allowed_term_months:[])
  setMethods(Array.isArray(settings?.payment_methods)?settings.payment_methods:[])
  setPlaces(Array.isArray(settings?.payment_places)?settings.payment_places:[])
  setNotes(settings?.operational_notes||'')
 },[settings])

 const dirty=useMemo(()=>{
  const a=JSON.stringify([...terms].sort((x,y)=>x-y))
  const b=JSON.stringify([...(settings?.allowed_term_months||[])].sort((x,y)=>x-y))
  return a!==b||
   JSON.stringify(methods)!==JSON.stringify(settings?.payment_methods||[])||
   JSON.stringify(places)!==JSON.stringify(settings?.payment_places||[])||
   notes!==(settings?.operational_notes||'')
 },[terms,methods,places,notes,settings])

 const addTerm=()=>{
  const value=Number(termInput)
  if(!Number.isInteger(value)||value<1||value>240)return
  setTerms(current=>Array.from(new Set([...current,value])).sort((a,b)=>a-b))
  setTermInput('')
 }
 const addMethod=()=>{
  const value=normalized(methodInput)
  if(!value)return
  setMethods(current=>uniqCaseInsensitive([...current,value]))
  setMethodInput('')
 }
 const addPlace=()=>{
  const value=normalized(placeInput)
  if(!value)return
  setPlaces(current=>uniqCaseInsensitive([...current,value]))
  setPlaceInput('')
 }

 const submit=e=>{
  e.preventDefault()
  if(!canManage)return
  act(async()=>{
   const {error}=await supabase.rpc('inv_save_company_settings',{
    p_company_id:company.id,
    p_allowed_term_months:terms,
    p_payment_methods:methods,
    p_payment_places:places,
    p_operational_notes:normalized(notes),
   })
   if(error)throw error
  },'Configuración operativa guardada correctamente.')
 }

 const accessRows=[
  ['Consultar información','Sí','Sí','Sí','Sí'],
  ['Registrar / editar expedientes','Sí','Sí','Sí','Consulta'],
  ['Registrar solicitudes','Sí','Sí','Sí','No'],
  ['Aprobar / rechazar solicitudes','Sí','Sí','No','No'],
  ['Formalizar inversiones','Sí','Sí','No','No'],
  ['Registrar o revertir pagos','Sí','Sí','No','No'],
  ['Modificar beneficiarios','Sí','Sí','No','No'],
  ['Cambiar estado de documentos','Sí','Sí','No','No'],
  ['Gestionar renovaciones','Sí','Sí','No','No'],
  ['Modificar esta configuración','Sí','Sí','No','No'],
 ]

 return <section className="prst-configuration-module">
  <section className="prst-investor-summary prst-config-summary">
   <article><span>Empresa</span><strong>{company?.name||'Prestadito$'}</strong><small>vertical de inversionistas</small></article>
   <article><span>Tu rol</span><strong>{role||'—'}</strong><small>permisos efectivos</small></article>
   <article><span>Plazos configurados</span><strong>{terms.length}</strong><small>{terms.length?terms.join(', ')+' meses':'sin restricción configurada'}</small></article>
   <article><span>Rendimiento</span><strong>Manual</strong><small>regla automática pendiente</small></article>
  </section>

  <form className="prst-card prst-form prst-config-form" onSubmit={submit}>
   <div className="prst-card-head">
    <div><small>CONFIGURACIÓN OPERATIVA</small><h2>Reglas y catálogos de Prestadito$</h2><p>Centraliza opciones de uso sin inventar la fórmula financiera.</p></div>
    <button className="prst-report-export" type="submit" disabled={saving||!canManage||!dirty}>{saving?'Guardando…':'Guardar cambios'}</button>
   </div>

   {!canManage&&<div className="prst-note">Tu rol es de consulta. Solo propietario o administrador puede modificar la configuración.</div>}

   <div className="prst-config-sections">
    <section>
     <div className="prst-section-title">Plazos disponibles</div>
     <p className="prst-copy">Si la lista queda vacía, el ERP no impone un catálogo de plazos. Cuando agregués meses, aparecerán como opciones sugeridas en los procesos de inversión.</p>
     <div className="prst-config-add-row">
      <Field label="Agregar plazo en meses"><input type="number" min="1" max="240" step="1" value={termInput} onChange={e=>setTermInput(e.target.value)} disabled={!canManage} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTerm()}}}/></Field>
      <button type="button" onClick={addTerm} disabled={!canManage||!termInput}>Agregar</button>
     </div>
     <div className="prst-chip-list">{terms.length?terms.map(value=><span key={value}>{value} meses<button type="button" onClick={()=>setTerms(current=>current.filter(x=>x!==value))} disabled={!canManage}>×</button></span>):<small>Sin plazos predefinidos.</small>}</div>
    </section>

    <section>
     <div className="prst-section-title">Formas de pago</div>
     <p className="prst-copy">Catálogo sugerido para solicitudes, inversiones y pagos. No obliga a usar una forma específica.</p>
     <div className="prst-config-add-row">
      <Field label="Nueva forma de pago"><input value={methodInput} onChange={e=>setMethodInput(e.target.value)} disabled={!canManage} placeholder="Ej. Transferencia bancaria" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addMethod()}}}/></Field>
      <button type="button" onClick={addMethod} disabled={!canManage||!normalized(methodInput)}>Agregar</button>
     </div>
     <div className="prst-chip-list">{methods.length?methods.map(value=><span key={value}>{value}<button type="button" onClick={()=>setMethods(current=>current.filter(x=>x!==value))} disabled={!canManage}>×</button></span>):<small>Sin formas de pago predefinidas.</small>}</div>
    </section>

    <section>
     <div className="prst-section-title">Lugares de pago</div>
     <p className="prst-copy">Sirve para mantener nombres consistentes de oficina, banco, sucursal u otro punto acordado.</p>
     <div className="prst-config-add-row">
      <Field label="Nuevo lugar de pago"><input value={placeInput} onChange={e=>setPlaceInput(e.target.value)} disabled={!canManage} placeholder="Ej. Oficina central" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addPlace()}}}/></Field>
      <button type="button" onClick={addPlace} disabled={!canManage||!normalized(placeInput)}>Agregar</button>
     </div>
     <div className="prst-chip-list">{places.length?places.map(value=><span key={value}>{value}<button type="button" onClick={()=>setPlaces(current=>current.filter(x=>x!==value))} disabled={!canManage}>×</button></span>):<small>Sin lugares de pago predefinidos.</small>}</div>
    </section>

    <section>
     <div className="prst-section-title">Rendimiento financiero</div>
     <div className="prst-config-locked">
      <div><span>Modo actual</span><strong>Manual · pendiente de regla real</strong></div>
      <p>No se habilita ninguna tasa, fórmula ni cálculo automático hasta que Prestadito$ defina oficialmente cómo se calcula el rendimiento según monto, plazo, frecuencia y demás condiciones.</p>
     </div>
    </section>

    <section>
     <div className="prst-section-title">Notas operativas</div>
     <Field label="Indicaciones internas"><textarea value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canManage} placeholder="Políticas internas, observaciones de operación o instrucciones para el equipo."/></Field>
    </section>
   </div>
  </form>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>PERMISOS EFECTIVOS</small><h2>Matriz de acceso</h2><p>Resumen de las restricciones que ya aplica el ERP.</p></div></div>
   <div className="prst-table-wrap"><table className="prst-config-permissions">
    <thead><tr><th>Acción</th><th>Propietario</th><th>Administrador</th><th>Personal</th><th>Otros miembros</th></tr></thead>
    <tbody>{accessRows.map(row=><tr key={row[0]}>{row.map((cell,index)=><td key={index}>{index===0?<b>{cell}</b>:<span className={cell==='Sí'?'prst-permission-yes':cell==='No'?'prst-permission-no':'prst-permission-limited'}>{cell}</span>}</td>)}</tr>)}</tbody>
   </table></div>
   <div className="prst-note"><strong>Seguridad:</strong> la matriz refleja los controles actuales del vertical. Cambiar los roles de usuarios se administra desde IDEALO SV, no desde este módulo.</div>
  </article>
 </section>
}
