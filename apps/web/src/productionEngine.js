export const PRODUCTION_STAGES = [
  ['PENDING','Pendiente'],['DESIGN','Diseño'],['APPROVAL','Aprobación'],['WAITING_MATERIAL','Esperando material'],['PRODUCTION','Producción'],['QUALITY','Control de calidad'],['REWORK','Reproceso'],['FINISHING','Terminaciones'],['READY','Listo'],['INSTALLATION','Instalación'],['DELIVERED','Entregado'],['CANCELLED','Cancelado']
]

export const NEXT_STAGE = { PENDING:'DESIGN', DESIGN:'APPROVAL', APPROVAL:'WAITING_MATERIAL', WAITING_MATERIAL:'PRODUCTION', PRODUCTION:'QUALITY', QUALITY:'FINISHING', REWORK:'QUALITY', FINISHING:'READY', READY:'INSTALLATION', INSTALLATION:'DELIVERED' }

export const productionMetrics = (rows=[]) => {
  const open = rows.filter(r=>!['DELIVERED','CANCELLED'].includes(r.status))
  const now = Date.now()
  const late = open.filter(r=>r.due_at && new Date(r.due_at).getTime()<now)
  const actualCost = rows.reduce((s,r)=>s+Number(r.actual_cost||0)+Number(r.waste_cost||0)+Number(r.rework_cost||0),0)
  const sales = rows.reduce((s,r)=>s+Number(r.total||0),0)
  return { total:rows.length, open:open.length, late:late.length, urgent:open.filter(r=>r.priority==='URGENT').length, production:open.filter(r=>r.status==='PRODUCTION').length, quality:open.filter(r=>r.status==='QUALITY').length, ready:open.filter(r=>r.status==='READY').length, actualCost, sales, margin:sales?((sales-actualCost)/sales)*100:0 }
}

export const taskProgress = (tasks=[]) => tasks.length ? Math.round(tasks.filter(t=>t.status==='DONE').length/tasks.length*100) : 0
export const materialStatus = (materials=[]) => !materials.length ? 'PENDING' : materials.every(m=>Number(m.reserved_qty)>=Number(m.required_qty)) ? 'READY' : materials.some(m=>Number(m.reserved_qty)>0) ? 'PARTIAL' : 'MISSING'
export const canAdvanceProduction = (order, tasks=[], materials=[]) => {
  if(order.status==='APPROVAL' && order.design_status!=='APPROVED') return {ok:false,reason:'El diseño debe estar aprobado.'}
  if(order.status==='WAITING_MATERIAL' && materialStatus(materials)!=='READY') return {ok:false,reason:'Faltan materiales por reservar.'}
  if(order.status==='QUALITY' && order.quality_status!=='APPROVED') return {ok:false,reason:'Control de calidad debe aprobar el trabajo.'}
  if(order.status==='PRODUCTION' && tasks.length && taskProgress(tasks)<100) return {ok:false,reason:'Hay procesos de producción pendientes.'}
  return {ok:true,reason:''}
}
