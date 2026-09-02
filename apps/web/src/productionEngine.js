export const PRODUCTION_STAGES = [
  ['PENDING','Pendiente'],
  ['DESIGN','Diseño'],
  ['PRODUCTION','En producción'],
  ['READY','Listo'],
  ['DELIVERED','Entregado'],
]

export const NEXT_STAGE = {
  PENDING:'DESIGN',
  DESIGN:'PRODUCTION',
  PRODUCTION:'READY',
  READY:'DELIVERED',
}

// Compatibilidad: órdenes creadas con el flujo anterior se muestran dentro
// de una de las cinco etapas simples sin perder sus datos históricos.
export const SIMPLE_STAGE = {
  APPROVAL:'DESIGN',
  WAITING_MATERIAL:'PRODUCTION',
  QUALITY:'PRODUCTION',
  REWORK:'PRODUCTION',
  FINISHING:'PRODUCTION',
  INSTALLATION:'READY',
  CANCELLED:'CANCELLED',
}

export const visibleProductionStatus = status => SIMPLE_STAGE[status] || status

export const productionMetrics = (rows=[]) => {
  const open = rows.filter(r=>!['DELIVERED','CANCELLED'].includes(r.status))
  const now = Date.now()
  const late = open.filter(r=>r.due_at && new Date(r.due_at).getTime()<now)
  const actualCost = rows.reduce((s,r)=>s+Number(r.actual_cost||0)+Number(r.waste_cost||0)+Number(r.rework_cost||0),0)
  const sales = rows.reduce((s,r)=>s+Number(r.total||0),0)
  return {
    total:rows.length,
    open:open.length,
    late:late.length,
    urgent:open.filter(r=>r.priority==='URGENT').length,
    production:open.filter(r=>visibleProductionStatus(r.status)==='PRODUCTION').length,
    quality:open.filter(r=>r.status==='QUALITY').length,
    ready:open.filter(r=>visibleProductionStatus(r.status)==='READY').length,
    actualCost,
    sales,
    margin:sales?((sales-actualCost)/sales)*100:0,
  }
}

export const taskProgress = (tasks=[]) => tasks.length ? Math.round(tasks.filter(t=>t.status==='DONE').length/tasks.length*100) : 0
export const materialStatus = (materials=[]) => !materials.length ? 'PENDING' : materials.every(m=>Number(m.reserved_qty)>=Number(m.required_qty)) ? 'READY' : materials.some(m=>Number(m.reserved_qty)>0) ? 'PARTIAL' : 'MISSING'

// El flujo principal ya no bloquea el avance por controles técnicos.
// Esos controles siguen disponibles dentro de Más detalles.
export const canAdvanceProduction = () => ({ok:true,reason:''})
