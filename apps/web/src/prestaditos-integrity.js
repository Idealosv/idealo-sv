const allowedRates=new Set([10,12,15])
const posted=payment=>(payment.status||'POSTED')==='POSTED'

export const buildPrestaditosIntegrityChecks=({investors=[],applications=[],investments=[],beneficiaries=[],payments=[],renewals=[],documents=[],contracts=[]})=>{
 const issues=[]

 const seenApplications=new Set()
 for(const inv of investments){
  if(inv.application_id){
   if(seenApplications.has(inv.application_id))issues.push({severity:'ERROR',code:'DUPLICATE_APPLICATION_INVESTMENT',entity:inv.investment_code,detail:'Más de una inversión usa la misma solicitud.'})
   seenApplications.add(inv.application_id)
  }
  if(inv.agreed_return_rate!=null&&!allowedRates.has(Number(inv.agreed_return_rate)))issues.push({severity:'ERROR',code:'INVALID_RATE',entity:inv.investment_code,detail:'La tasa no es 10%, 12% o 15%.'})
  if(inv.agreed_return_rate!=null&&inv.return_rate_basis!=='ANNUAL')issues.push({severity:'ERROR',code:'INVALID_RATE_BASIS',entity:inv.investment_code,detail:'La tasa acordada no está marcada como anual.'})
  const returned=payments.filter(x=>posted(x)&&x.investment_id===inv.id&&x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
  if(returned>Number(inv.principal||0)+0.005)issues.push({severity:'ERROR',code:'CAPITAL_OVER_RETURNED',entity:inv.investment_code,detail:'La devolución de capital supera el principal.'})
 }

 const contractInvestmentIds=new Set()
 for(const contract of contracts){
  if(contractInvestmentIds.has(contract.investment_id))issues.push({severity:'ERROR',code:'DUPLICATE_CONTRACT',entity:contract.contract_code,detail:'Existe más de un contrato para la misma inversión.'})
  contractInvestmentIds.add(contract.investment_id)
  if(contract.return_rate_percent!=null&&!allowedRates.has(Number(contract.return_rate_percent)))issues.push({severity:'ERROR',code:'INVALID_CONTRACT_RATE',entity:contract.contract_code,detail:'El contrato usa una tasa fuera de 10%, 12% o 15%.'})
  if(contract.return_rate_percent!=null&&contract.rate_basis!=='ANNUAL')issues.push({severity:'ERROR',code:'INVALID_CONTRACT_RATE_BASIS',entity:contract.contract_code,detail:'La tasa contractual no está marcada como anual.'})
  if(contract.status==='SIGNED'&&!contract.signed_document_id)issues.push({severity:'ERROR',code:'SIGNED_WITHOUT_DOCUMENT',entity:contract.contract_code,detail:'Contrato marcado firmado sin documento asociado.'})
 }

 for(const payment of payments){
  if(payment.status==='REVERSED'&&!String(payment.reversal_reason||'').trim())issues.push({severity:'ERROR',code:'REVERSED_WITHOUT_REASON',entity:payment.payment_code,detail:'Pago revertido sin motivo.'})
  if(posted(payment)&&Number(payment.amount||0)<=0)issues.push({severity:'ERROR',code:'NON_POSITIVE_PAYMENT',entity:payment.payment_code,detail:'Pago vigente con monto no positivo.'})
 }

 for(const renewal of renewals){
  if(renewal.status==='EXECUTED'&&renewal.decision_type!=='WITHDRAW'&&!renewal.successor_investment_id)issues.push({severity:'ERROR',code:'EXECUTED_WITHOUT_SUCCESSOR',entity:renewal.renewal_code,detail:'Renovación ejecutada sin inversión sucesora.'})
  if(renewal.status==='RECORDED'&&!investments.some(x=>x.id===renewal.investment_id))issues.push({severity:'ERROR',code:'ORPHAN_RENEWAL',entity:renewal.renewal_code,detail:'Decisión de renovación sin inversión de origen.'})
 }

 for(const document of documents){
  if(document.status==='ACTIVE'&&!String(document.storage_path||'').trim())issues.push({severity:'ERROR',code:'DOCUMENT_WITHOUT_PATH',entity:document.document_code,detail:'Documento activo sin ruta privada.'})
 }

 for(const beneficiary of beneficiaries){
  if(beneficiary.active===false)continue
  const sameInvestor=beneficiaries.filter(x=>x.investor_id===beneficiary.investor_id&&x.active!==false)
  const total=sameInvestor.reduce((s,x)=>s+Number(x.percentage||0),0)
  if(total>100.005)issues.push({severity:'ERROR',code:'BENEFICIARY_OVER_100',entity:beneficiary.investor_id,detail:'La asignación activa de beneficiarios supera 100%.'})
 }

 const duplicateDuis=new Map()
 for(const investor of investors){
  const dui=String(investor.dui||'').trim()
  if(!dui)continue
  duplicateDuis.set(dui,(duplicateDuis.get(dui)||0)+1)
 }
 for(const [dui,count] of duplicateDuis)if(count>1)issues.push({severity:'WARN',code:'DUPLICATE_INVESTOR_DUI',entity:dui,detail:'Hay '+count+' inversionistas con el mismo DUI.'})

 const applicationIds=new Set(applications.map(x=>x.id))
 for(const inv of investments){
  if(inv.application_id&&!applicationIds.has(inv.application_id))issues.push({severity:'WARN',code:'MISSING_APPLICATION_REFERENCE',entity:inv.investment_code,detail:'La inversión conserva un application_id que no está cargado en la vista actual.'})
 }

 return issues.filter((issue,index,array)=>array.findIndex(x=>x.code===issue.code&&x.entity===issue.entity)===index)
}

export const PRESTADITOS_SECURITY_CONTROLS=[
 {name:'Aislamiento por empresa',detail:'Las tablas del vertical usan company_id y RLS con inv_company_member.'},
 {name:'Pagos protegidos',detail:'Altas y reversión pasan por RPC; authenticated no inserta, actualiza ni elimina pagos directamente.'},
 {name:'Inversiones protegidas',detail:'La formalización y renovación pasan por RPC controladas; no hay inserción directa autenticada.'},
 {name:'Documentos privados',detail:'Los archivos usan bucket privado y apertura mediante URL firmada temporal.'},
 {name:'Contratos auditados',detail:'Preparación y registro de contrato firmado generan eventos de auditoría.'},
 {name:'Cierres no destructivos',detail:'Los cierres mensuales son snapshots versionados y no alteran movimientos.'},
]
