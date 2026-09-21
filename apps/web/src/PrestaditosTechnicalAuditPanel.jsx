import { useMemo } from 'react'
import { buildPrestaditosIntegrityChecks, PRESTADITOS_SECURITY_CONTROLS } from './prestaditos-integrity.js'

export default function PrestaditosTechnicalAuditPanel({investors,applications,investments,beneficiaries,payments,renewals,documents,contracts}){
 const issues=useMemo(()=>buildPrestaditosIntegrityChecks({investors,applications,investments,beneficiaries,payments,renewals,documents,contracts}),[investors,applications,investments,beneficiaries,payments,renewals,documents,contracts])
 const errors=issues.filter(x=>x.severity==='ERROR')
 const warnings=issues.filter(x=>x.severity==='WARN')
 const ok=issues.length===0

 const printAudit=()=>{
  const popup=window.open('','_blank')
  if(!popup)return
  try{popup.opener=null}catch{}
  popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Auditoría técnica Prestadito$</title><style>body{font-family:Arial,sans-serif;padding:34px;color:#111}h1{font-size:22px}.ok{color:#2e6b42}.bad{color:#9c342e}.warn{color:#8b651c}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:11px}th{background:#f4f5f6}.box{border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0}.footer{margin-top:20px;color:#777;font-size:10px}@media print{button{display:none}}</style></head><body>'+
   '<h1>PRESTADITO$ · Auditoría técnica del vertical</h1>'+
   '<p class="'+(ok?'ok':'bad')+'"><strong>'+(ok?'Sin inconsistencias detectadas':'Se detectaron '+issues.length+' observaciones')+'</strong></p>'+
   '<table><thead><tr><th>Nivel</th><th>Código</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>'+
   (issues.length?issues.map(x=>'<tr><td>'+x.severity+'</td><td>'+x.code+'</td><td>'+String(x.entity||'')+'</td><td>'+String(x.detail||'')+'</td></tr>').join(''):'<tr><td colspan="4">Sin inconsistencias detectadas.</td></tr>')+
   '</tbody></table><h2>Controles de seguridad implementados</h2>'+
   PRESTADITOS_SECURITY_CONTROLS.map(x=>'<div class="box"><strong>'+x.name+'</strong><div>'+x.detail+'</div></div>').join('')+
   '<div class="footer">Generado '+new Date().toLocaleString('es-SV')+'</div><button onclick="window.print()">Imprimir / guardar PDF</button></body></html>')
  popup.document.close()
 }

 return <section className="prst-tech-audit-module">
  <section className="prst-investor-summary prst-tech-audit-summary">
   <article><span>Estado general</span><strong>{ok?'Correcto':'Revisar'}</strong><small>{ok?'sin inconsistencias detectadas':issues.length+' observaciones'}</small></article>
   <article><span>Errores</span><strong>{errors.length}</strong><small>integridad crítica</small></article>
   <article><span>Advertencias</span><strong>{warnings.length}</strong><small>requieren verificación</small></article>
   <article><span>Controles</span><strong>{PRESTADITOS_SECURITY_CONTROLS.length}</strong><small>seguridad implementada</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>AUDITORÍA TÉCNICA</small><h2>Integridad del vertical</h2><p>Revisa consistencia de inversiones, pagos, contratos, beneficiarios, documentos y renovaciones con los datos cargados.</p></div>
    <button type="button" className="prst-report-export" onClick={printAudit}>Imprimir / guardar PDF</button>
   </div>

   {ok?<div className="prst-tech-ok"><strong>Sin inconsistencias detectadas.</strong><span>Las validaciones de datos cargados pasaron correctamente.</span></div>:<div className="prst-table-wrap"><table className="prst-tech-audit-table"><thead><tr><th>Nivel</th><th>Control</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>{issues.map((issue,index)=><tr key={issue.code+'-'+issue.entity+'-'+index}><td><span className={'prst-tech-level '+issue.severity.toLowerCase()}>{issue.severity==='ERROR'?'Error':'Advertencia'}</span></td><td><b>{issue.code}</b></td><td>{issue.entity||'—'}</td><td>{issue.detail}</td></tr>)}</tbody></table></div>}
  </article>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>ARQUITECTURA DE SEGURIDAD</small><h2>Controles implementados</h2><p>Resumen de protecciones incorporadas específicamente en Prestadito$.</p></div></div>
   <div className="prst-security-checks">{PRESTADITOS_SECURITY_CONTROLS.map(row=><article key={row.name}><span>✓</span><div><strong>{row.name}</strong><small>{row.detail}</small></div></article>)}</div>
  </article>

  <article className="prst-card prst-tech-note">
   <div className="prst-card-head"><div><small>ALCANCE</small><h2>Qué cubre esta auditoría</h2></div></div>
   <p className="prst-copy">Esta pantalla revisa integridad de datos cargados y documenta controles del vertical. Las pruebas automatizadas de GitHub siguen siendo una capa separada y pueden fallar por pruebas heredadas de otras áreas de IDEALO SV; esos fallos deben revisarse antes de fusionar la rama a producción.</p>
  </article>
 </section>
}
