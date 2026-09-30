const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const dateOnly=value=>String(value||'').slice(0,10)
const addDays=(value,days)=>{
 const d=new Date(dateOnly(value)+'T12:00:00')
 d.setDate(d.getDate()+days)
 return d.toISOString().slice(0,10)
}

export const buildPrestaditosAgenda=({
 investors=[],
 applications=[],
 investments=[],
 contracts=[],
 renewals=[],
 investorMap=new Map(),
})=>{
 const events=[]
 const contractByInvestment=new Map(contracts.map(x=>[x.investment_id,x]))
 const investmentById=new Map(investments.map(x=>[x.id,x]))
 const current=today()

 const push=(event)=>events.push({...event,date:dateOnly(event.date||current)})

 for(const investment of investments){
  if(['CLOSED','CANCELLED','RENEWED'].includes(investment.status))continue
  const investor=investorMap.get(investment.investor_id)
  if(investment.maturity_date){
   push({
    id:'maturity-'+investment.id,
    date:investment.maturity_date,
    type:'MATURITY',
    priority:dateOnly(investment.maturity_date)<current?'CRITICAL':'HIGH',
    title:'Vencimiento de inversión',
    detail:fullName(investor)+' · '+investment.investment_code,
    tab:'Vencimientos',
    investor_id:investment.investor_id,
    investment_id:investment.id,
   })
  }
  const contract=contractByInvestment.get(investment.id)
  if(!contract){
   push({
    id:'contract-missing-'+investment.id,
    date:current,
    type:'CONTRACT',
    priority:'HIGH',
    floating:true,
    title:'Preparar contrato',
    detail:fullName(investor)+' · '+investment.investment_code+' · sin fecha límite registrada',
    tab:'Contratos',
    investor_id:investment.investor_id,
    investment_id:investment.id,
   })
  }else if(contract.status==='GENERATED'){
   push({
    id:'contract-sign-'+contract.id,
    date:current,
    type:'CONTRACT',
    priority:'HIGH',
    floating:true,
    title:'Contrato pendiente de firma',
    detail:fullName(investor)+' · '+contract.contract_code+' · sin fecha límite registrada',
    tab:'Contratos',
    investor_id:investment.investor_id,
    investment_id:investment.id,
   })
  }
 }

 for(const application of applications){
  if(['REJECTED','ACTIVE'].includes(application.status))continue
  const investor=investorMap.get(application.investor_id)
  const preferred=application.requested_start_date||current
  if(application.status==='REVIEW'){
   push({
    id:'application-review-'+application.id,
    date:preferred,
    type:'REVIEW',
    priority:'HIGH',
    floating:!application.requested_start_date,
    title:'Revisar solicitud',
    detail:fullName(investor)+' · '+(application.application_code||'Solicitud')+(application.requested_start_date?'':' · sin fecha solicitada'),
    tab:'Solicitudes',
    investor_id:application.investor_id,
   })
  }
  if(application.status==='SIGNATURE'){
   push({
    id:'application-signature-'+application.id,
    date:preferred,
    type:'SIGNATURE',
    priority:'HIGH',
    floating:!application.requested_start_date,
    title:'Completar firma de solicitud',
    detail:fullName(investor)+' · '+(application.application_code||'Solicitud')+(application.requested_start_date?'':' · sin fecha solicitada'),
    tab:'Solicitudes',
    investor_id:application.investor_id,
   })
  }
  if(application.status==='FUNDS_RECEIVED'){
   push({
    id:'application-funds-'+application.id,
    date:current,
    type:'FORMALIZATION',
    priority:'CRITICAL',
    floating:true,
    title:'Formalizar inversión',
    detail:fullName(investor)+' · fondos recibidos',
    tab:'Inversiones',
    investor_id:application.investor_id,
   })
  }
 }

 for(const investor of investors){
  if(investor.status!=='ACTIVE')continue
  const missing=[]
  if(!investor.face_photo_path)missing.push('rostro')
  if(!investor.dui_front_path)missing.push('DUI frente')
  if(!investor.dui_back_path)missing.push('DUI reverso')
  if(missing.length){
   push({
    id:'investor-docs-'+investor.id,
    date:current,
    type:'DOCUMENTS',
    priority:'MEDIUM',
    floating:true,
    title:'Completar expediente',
    detail:fullName(investor)+' · falta '+missing.join(', '),
    tab:'Perfil 360',
    investor_id:investor.id,
   })
  }
 }

 for(const renewal of renewals){
  if(renewal.status!=='RECORDED')continue
  const investment=investmentById.get(renewal.investment_id)
  const investor=investorMap.get(renewal.investor_id)
  const eventDate=investment?.maturity_date||current
  push({
   id:'renewal-'+renewal.id,
   date:eventDate,
   type:'RENEWAL',
   priority:eventDate<=current?'HIGH':'MEDIUM',
   floating:!investment?.maturity_date,
   title:renewal.decision_type==='WITHDRAW'?'Gestionar retiro':'Gestionar renovación',
   detail:fullName(investor)+' · '+renewal.renewal_code,
   tab:'Renovaciones',
   investor_id:renewal.investor_id,
   investment_id:renewal.investment_id,
  })
 }

 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title))
}

export const agendaWindow=(events,view)=>{
 const current=today()
 if(view==='TODAY')return events.filter(x=>x.date<=current)
 const days=view==='WEEK'?7:30
 const end=addDays(current,days)
 return events.filter(x=>x.date<=end)
}
