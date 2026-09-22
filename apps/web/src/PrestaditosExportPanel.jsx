import { useMemo } from 'react'
import { canPrestaditos, prestaditosRoleLabel } from './prestaditos-permissions.js'

const download=(name,content,type='application/json')=>{
 const blob=new Blob([content],{type})
 const url=URL.createObjectURL(blob)
 const a=document.createElement('a')
 a.href=url
 a.download=name
 document.body.appendChild(a)
 a.click()
 a.remove()
 setTimeout(()=>URL.revokeObjectURL(url),500)
}
const csvEscape=value=>{
 const text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'')
 return /[",\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text
}
const toCsv=rows=>{
 if(!rows.length)return ''
 const keys=Array.from(rows.reduce((set,row)=>{Object.keys(row||{}).forEach(k=>set.add(k));return set},new Set()))
 return [keys.join(','),...rows.map(row=>keys.map(key=>csvEscape(row?.[key])).join(','))].join('\n')
}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')

export default function PrestaditosExportPanel({
 company,role,investors,applications,investments,beneficiaries,payments,renewals,
 documents,contracts,audit,settings,notificationStates,closeouts,
}){
 const canExport=canPrestaditos(role,'EXPORT')
 const datasets=useMemo(()=>({
  inversionistas:investors,
  solicitudes:applications,
  inversiones:investments,
  beneficiarios:beneficiaries,
  pagos:payments,
  renovaciones:renewals,
  documentos:documents,
  contratos:contracts,
  auditoria:audit,
  cierres_mensuales:closeouts,
  notificaciones:notificationStates,
 }),[investors,applications,investments,beneficiaries,payments,renewals,documents,contracts,audit,closeouts,notificationStates])

 const counts=Object.values(datasets).reduce((sum,rows)=>sum+rows.length,0)

 const exportJson=()=>{
  if(!canExport)return
  const payload={
   export_version:1,
   generated_at:new Date().toISOString(),
   company:{id:company?.id||null,name:company?.name||'Prestadito$'},
   role:prestaditosRoleLabel(role),
   scope:'PRESTADITOS_INVESTORS',
   notes:[
    'Exportación de datos estructurados del vertical.',
    'Los documentos incluyen metadatos y rutas privadas; no incluye los archivos binarios del bucket.',
    'No constituye una restauración automática.',
   ],
   settings:settings||null,
   data:datasets,
  }
  download(`prestaditos-respaldo-${stamp()}.json`,JSON.stringify(payload,null,2))
 }

 const exportCsv=(name,rows)=>{
  if(!canExport)return
  download(`prestaditos-${name}-${stamp()}.csv`,'\uFEFF'+toCsv(rows),'text/csv;charset=utf-8')
 }

 return <section className="prst-export-module">
  <section className="prst-investor-summary prst-export-summary">
   <article><span>Registros exportables</span><strong>{counts}</strong><small>todas las colecciones cargadas</small></article>
   <article><span>Conjuntos</span><strong>{Object.keys(datasets).length}</strong><small>datos estructurados</small></article>
   <article><span>Rol</span><strong>{prestaditosRoleLabel(role)}</strong><small>{canExport?'exportación permitida':'sin permiso'}</small></article>
   <article><span>Archivos privados</span><strong>{documents.length}</strong><small>se exporta metadato, no binario</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>RESPALDO Y EXPORTACIÓN</small><h2>Exportación total de Prestadito$</h2><p>Descarga una copia estructurada de la información cargada actualmente para esta empresa.</p></div>
    <button type="button" className="prst-report-export" onClick={exportJson} disabled={!canExport}>Descargar respaldo JSON</button>
   </div>

   <div className="prst-note"><strong>Alcance:</strong> el JSON contiene inversionistas, solicitudes, inversiones, beneficiarios, movimientos, renovaciones, contratos, documentos, auditoría, cierres y configuración. Por seguridad, los archivos privados del bucket no se incrustan; se conserva su ruta y metadatos.</div>

   <div className="prst-export-grid">{Object.entries(datasets).map(([name,rows])=><article key={name}>
    <div><strong>{name.replaceAll('_',' ')}</strong><small>{rows.length} registro{rows.length===1?'':'s'}</small></div>
    <button type="button" onClick={()=>exportCsv(name,rows)} disabled={!canExport||!rows.length}>CSV</button>
   </article>)}</div>
  </article>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>SEGURIDAD DEL RESPALDO</small><h2>Recomendaciones</h2></div></div>
   <div className="prst-alert-rules">
    <span>Guardar el archivo en una ubicación privada y con acceso controlado.</span>
    <span>No enviarlo por canales públicos porque contiene información personal.</span>
    <span>Los CSV son para análisis; el JSON conserva mejor la estructura completa.</span>
    <span>La restauración automática no está habilitada para evitar sobrescrituras accidentales.</span>
   </div>
  </article>
 </section>
}
