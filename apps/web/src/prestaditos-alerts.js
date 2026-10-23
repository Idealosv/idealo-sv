const today=()=>new Date().toISOString().slice(0,10)
const daysUntil=value=>value?Math.ceil((new Date(String(value).slice(0,10)+'T12:00:00').getTime()-new Date(today()+'T12:00:00').getTime())/86400000):null
const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'

const priorityWeight={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}

export const buildPrestaditosAlerts=({investors=[],applications=[],investments=[],contracts=[],payments=[],renewals=[],investorMap=new Map()})=>{
 const alerts=[]
 const postedPayments=payments.filter(x=>(x.status||'POSTED')==='POSTED')
 const investmentById=new Map(investments.map(x=>[x.id,x]))
 const contractByInvestment=new Map(contracts.map(x=>[x.investment_id,x]))
 const investmentByApplication=new Map(investments.filter(x=>x.application_id).map(x=>[x.application_id,x]))

 for(const investor of investors){
  if(investor.status!=='ACTIVE')continue
  const missing=[]
  if(!investor.face_photo_path)missing.push('foto del rostro')
  if(!investor.dui_front_path)missing.push('DUI frente')
  if(!investor.dui_back_path)missing.push('DUI reverso')
  if(missing.length){
   alerts.push({
    id:'docs-'+investor.id,
    priority:'MEDIUM',
    type:'DOCUMENTS',
    title:'Expediente incompleto',
    detail:fullName(investor)+' · falta '+missing.join(', '),
    tab:'Inversionistas',
    investor_id:investor.id,
   })
  }
 }

 for(const application of applications){
  const investor=investorMap.get(application.investor_id)
  if(application.status==='SIGNATURE'){
   alerts.push({id:'app-sign-'+application.id,priority:'HIGH',type:'APPLICATION',title:'Solicitud pendiente de firma',detail:fullName(investor)+' · '+(application.application_code||'Solicitud'),tab:'Solicitudes',investor_id:application.investor_id})
  }
  if(application.status==='FUNDS_RECEIVED'&&!investmentByApplication.has(application.id)){
   alerts.push({id:'app-funds-'+application.id,priority:'CRITICAL',type:'APPLICATION',title:'Fondos recibidos sin formalizar',detail:fullName(investor)+' · '+money(application.approved_amount??application.requested_amount),tab:'Inversiones',investor_id:application.investor_id})
  }
 }

 for(const investment of investments){
  if(['CLOSED','CANCELLED','RENEWED'].includes(investment.status))continue
  const investor=investorMap.get(investment.investor_id)
  const d=daysUntil(investment.maturity_date)
  if(d!==null&&d<0){
   alerts.push({id:'maturity-overdue-'+investment.id,priority:'CRITICAL',type:'MATURITY',title:'Inversión vencida',detail:fullName(investor)+' · '+investment.investment_code+' · '+Math.abs(d)+' días vencida',tab:'Vencimientos',investment_id:investment.id,investor_id:investment.investor_id})
  }else if(d!==null&&d<=7){
   alerts.push({id:'maturity-7-'+investment.id,priority:'HIGH',type:'MATURITY',title:'Vencimiento en 7 días o menos',detail:fullName(investor)+' · '+investment.investment_code+' · '+d+' días restantes',tab:'Vencimientos',investment_id:investment.id,investor_id:investment.investor_id})
  }else if(d!==null&&d<=30){
   alerts.push({id:'maturity-30-'+investment.id,priority:'MEDIUM',type:'MATURITY',title:'Vencimiento próximo',detail:fullName(investor)+' · '+investment.investment_code+' · '+d+' días restantes',tab:'Vencimientos',investment_id:investment.id,investor_id:investment.investor_id})
  }

  const contract=contractByInvestment.get(investment.id)
  if(!contract){
   alerts.push({id:'contract-missing-'+investment.id,priority:'HIGH',type:'CONTRACT',title:'Contrato no preparado',detail:fullName(investor)+' · '+investment.investment_code,tab:'Contratos',investment_id:investment.id,investor_id:investment.investor_id})
  }else if(contract.status==='GENERATED'){
   alerts.push({id:'contract-sign-'+investment.id,priority:'HIGH',type:'CONTRACT',title:'Contrato pendiente de firma',detail:fullName(investor)+' · '+contract.contract_code,tab:'Contratos',investment_id:investment.id,investor_id:investment.investor_id})
  }

  if(d!==null&&d<=0){
   const capitalReturned=postedPayments.filter(x=>x.investment_id===investment.id&&x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
   const outstanding=Math.max(0,Number(investment.principal||0)-capitalReturned)
   if(outstanding>0){
    alerts.push({id:'capital-return-'+investment.id,priority:'CRITICAL',type:'PAYMENT',title:'Capital pendiente de liquidar al vencimiento',detail:fullName(investor)+' · saldo de capital '+money(outstanding),tab:'Rendimientos',investment_id:investment.id,investor_id:investment.investor_id})
   }
   if(investment.projected_gain!=null){
    const yieldPaid=postedPayments.filter(x=>x.investment_id===investment.id&&x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
    const remaining=Math.max(0,Number(investment.projected_gain||0)-yieldPaid)
    if(remaining>0){
     alerts.push({id:'yield-review-'+investment.id,priority:'HIGH',type:'PAYMENT',title:'Revisar liquidación de rendimiento',detail:fullName(investor)+' · referencia pendiente '+money(remaining),tab:'Rendimientos',investment_id:investment.id,investor_id:investment.investor_id})
    }
   }
  }
 }

 for(const renewal of renewals.filter(x=>x.status==='RECORDED')){
  const investment=investmentById.get(renewal.investment_id)
  const investor=investorMap.get(renewal.investor_id)
  const d=daysUntil(investment?.maturity_date)
  alerts.push({
   id:'renewal-'+renewal.id,
   priority:d!==null&&d<=0?'HIGH':'MEDIUM',
   type:'RENEWAL',
   title:d!==null&&d<=0?'Decisión de renovación lista para ejecutar':'Decisión de renovación pendiente',
   detail:fullName(investor)+' · '+renewal.renewal_code,
   tab:'Renovaciones',
   investment_id:renewal.investment_id,
   investor_id:renewal.investor_id,
  })
 }

 return alerts.sort((a,b)=>(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)||a.title.localeCompare(b.title))
}
