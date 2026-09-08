export const money=(value)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))

export function localIsoDate(date=new Date()){
  const year=date.getFullYear()
  const month=String(date.getMonth()+1).padStart(2,'0')
  const day=String(date.getDate()).padStart(2,'0')
  return `${year}-${month}-${day}`
}

export function addDays(date,days){
  const [year,month,day]=String(date).split('-').map(Number)
  const next=new Date(year,month-1,day,12,0,0)
  next.setDate(next.getDate()+days)
  return localIsoDate(next)
}

export const balance=(row)=>Math.max(0,Number(row.amount_total||0)-Number(row.amount_paid||0))

export function normalizedReceivableStatus(row){
  return String(row?.status||'').trim().toUpperCase()
}

export function isCancelled(row){
  return ['CANCELLED','VOID','CANCELED','ANULADA','ANULADO'].includes(normalizedReceivableStatus(row))
}

export function isPaid(row){
  if(isCancelled(row))return false
  return normalizedReceivableStatus(row)==='PAID'||balance(row)<=0
}

export function isOpen(row){
  return !isCancelled(row)&&!isPaid(row)&&balance(row)>0
}

export function statusLabel(row,today=localIsoDate()){
  if(isCancelled(row))return 'Anulada'
  if(isPaid(row))return 'Pagada'
  if(row.due_date&&row.due_date<today)return 'Vencida'
  if(row.due_date&&row.due_date<=addDays(today,7))return 'Por vencer'
  return 'Pendiente'
}

export function matchesReceivableFilter(row,filter,today=localIsoDate()){
  const state=statusLabel(row,today)
  if(filter==='OPEN')return isOpen(row)
  if(filter==='OVERDUE')return state==='Vencida'
  if(filter==='DUE7')return state==='Por vencer'
  if(filter==='PAID')return isPaid(row)
  if(filter==='CANCELLED')return isCancelled(row)
  return true
}
