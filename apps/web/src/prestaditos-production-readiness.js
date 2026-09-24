export const PRESTADITOS_PRODUCTION_READINESS=[
 {key:'OFFICIAL_AMOUNT_TIERS',label:'Rangos oficiales por monto',status:'BLOCKED',detail:'Los rangos actuales de 10%, 12% y 15% anual siguen siendo ejemplos provisionales.'},
 {key:'NON_12_MONTH_RULE',label:'Regla para plazos distintos de 12 meses',status:'BLOCKED',detail:'Falta definir prorrateo/capitalización y redondeo.'},
 {key:'LEGAL_CONTRACT',label:'Contrato legal definitivo',status:'BLOCKED',detail:'El ERP genera un borrador operativo; falta el texto legal aprobado por Prestadito$.'},
 {key:'STAGING_DATABASE',label:'Base de pruebas separada',status:'BLOCKED',detail:'No se creó staging porque el usuario no desea pagar por el momento.'},
 {key:'FULL_CI',label:'CI general del repositorio',status:'PENDING',detail:'Debe quedar verde después de corregir pruebas heredadas y validar Android/iPhone.'},
]

export const productionReadinessSummary=items=>{
 const blocked=items.filter(x=>x.status==='BLOCKED')
 const pending=items.filter(x=>x.status==='PENDING')
 return {
  ready:blocked.length===0&&pending.length===0,
  blocked:blocked.length,
  pending:pending.length,
  total:items.length,
 }
}
