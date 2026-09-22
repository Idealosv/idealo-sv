const STATUS={
 READY:{label:'Listo',className:'ready'},
 PENDING:{label:'Pendiente',className:'pending'},
 BLOCKED:{label:'Bloqueado',className:'blocked'},
}

const CHECKS=[
 {area:'ERP funcional',status:'READY',detail:'Expedientes, solicitudes, inversiones, contratos, pagos, vencimientos, renovaciones, documentos, reportes y cierres están implementados.'},
 {area:'Tasas anuales',status:'READY',detail:'10%, 12% y 15% están registradas como tasas anuales.'},
 {area:'Rangos de monto',status:'PENDING',detail:'Los límites actuales son ejemplos provisionales y deben sustituirse cuando Prestadito$ entregue la tabla real.'},
 {area:'Plazos distintos de 12 meses',status:'PENDING',detail:'Falta definir prorrateo, capitalización y redondeo. El ERP no inventa ese cálculo.'},
 {area:'Contrato legal definitivo',status:'PENDING',detail:'Existe borrador operativo y PDF, pero falta el texto legal definitivo aprobado por Prestadito$.'},
 {area:'Firma electrónica criptográfica',status:'PENDING',detail:'Actualmente se registra el documento firmado. La firma electrónica formal depende de la decisión y proveedor de la empresa.'},
 {area:'Base aislada de staging',status:'BLOCKED',detail:'No se crea por ahora para evitar costos. El smoke test y runbook quedan preparados para usarla más adelante.'},
 {area:'Validación continua',status:'READY',detail:'Pruebas API, auditorías frontend y compilación web están en verde para el commit actual.'},
 {area:'Validación iPhone',status:'READY',detail:'La compilación para simulador iPhone terminó correctamente.'},
 {area:'Validación Android',status:'READY',detail:'APK debug y AAB de validación se generaron correctamente; la firma de tienda sigue fuera de este cierre.'},
]

export default function PrestaditosProductionReadinessPanel(){
 const ready=CHECKS.filter(x=>x.status==='READY').length
 const pending=CHECKS.filter(x=>x.status==='PENDING').length
 const blocked=CHECKS.filter(x=>x.status==='BLOCKED').length
 const productionReady=pending===0&&blocked===0

 return <section className="prst-readiness-module">
  <section className="prst-investor-summary prst-readiness-summary">
   <article><span>Listos</span><strong>{ready}</strong><small>controles cerrados</small></article>
   <article><span>Pendientes</span><strong>{pending}</strong><small>requieren definición o validación</small></article>
   <article><span>Bloqueados</span><strong>{blocked}</strong><small>decisión externa</small></article>
   <article><span>Producción</span><strong>{productionReady?'Lista':'No todavía'}</strong><small>{productionReady?'sin bloqueos':'mantener en rama de prueba'}</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>CIERRE PARA PRODUCCIÓN</small><h2>Checklist de liberación</h2><p>Estado real de los requisitos que deben quedar cerrados antes de fusionar Prestadito$ a producción.</p></div></div>

   <div className="prst-readiness-list">{CHECKS.map(row=>{
    const status=STATUS[row.status]
    return <article key={row.area}>
     <span className={'prst-readiness-status '+status.className}>{status.label}</span>
     <div><strong>{row.area}</strong><small>{row.detail}</small></div>
    </article>
   })}</div>

   <div className="prst-note"><strong>Regla de liberación:</strong> mientras exista un punto Pendiente o Bloqueado, esta rama no debe tratarse como lista para producción. Esto evita activar cálculos, contratos o infraestructura con supuestos incompletos.</div>
  </article>
 </section>
}
