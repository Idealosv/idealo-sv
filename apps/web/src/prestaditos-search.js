const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const clean=value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()

const score=(haystack,term)=>{
 const text=clean(haystack)
 if(!term||!text.includes(term))return -1
 if(text===term)return 100
 if(text.startsWith(term))return 70
 const words=text.split(/\s+/)
 if(words.some(word=>word.startsWith(term)))return 50
 return 20
}

export const buildPrestaditosSearchResults=({
 query,
 investors=[],
 applications=[],
 investments=[],
 contracts=[],
 payments=[],
 documents=[],
 beneficiaries=[],
 limit=30,
})=>{
 const term=clean(query)
 if(term.length<2)return []
 const investorMap=new Map(investors.map(x=>[x.id,x]))
 const investmentMap=new Map(investments.map(x=>[x.id,x]))
 const rows=[]

 const push=(type,id,title,subtitle,searchText,meta={})=>{
  const rank=score(searchText,term)
  if(rank<0)return
  rows.push({type,id,title,subtitle,rank,...meta})
 }

 for(const row of investors){
  push(
   'Inversionista',row.id,fullName(row),
   [row.investor_code,row.dui,row.phone||row.whatsapp].filter(Boolean).join(' · '),
   [fullName(row),row.investor_code,row.dui,row.nit,row.phone,row.whatsapp,row.email].join(' '),
   {investor_id:row.id,tab:'Perfil 360'}
  )
 }

 for(const row of applications){
  const investor=investorMap.get(row.investor_id)
  push(
   'Solicitud',row.id,row.application_code||'Solicitud',
   fullName(investor)+' · '+String(row.status||''),
   [row.application_code,fullName(investor),investor?.dui,row.status,row.requested_amount].join(' '),
   {investor_id:row.investor_id,tab:'Perfil 360'}
  )
 }

 for(const row of investments){
  const investor=investorMap.get(row.investor_id)
  push(
   'Inversión',row.id,row.investment_code||'Inversión',
   fullName(investor)+' · '+String(row.status||''),
   [row.investment_code,row.contract_number,fullName(investor),investor?.dui,row.principal,row.status].join(' '),
   {investor_id:row.investor_id,investment_id:row.id,tab:'Perfil 360'}
  )
 }

 for(const row of contracts){
  const investor=investorMap.get(row.investor_id)
  const investment=investmentMap.get(row.investment_id)
  push(
   'Contrato',row.id,row.contract_code||row.contract_number||'Contrato',
   fullName(investor)+' · '+(investment?.investment_code||''),
   [row.contract_code,row.contract_number,fullName(investor),investor?.dui,investment?.investment_code,row.status].join(' '),
   {investor_id:row.investor_id,investment_id:row.investment_id,tab:'Perfil 360'}
  )
 }

 for(const row of payments){
  const investor=investorMap.get(row.investor_id)
  const investment=investmentMap.get(row.investment_id)
  push(
   'Pago',row.id,row.payment_code||'Pago',
   fullName(investor)+' · '+String(row.payment_type||''),
   [row.payment_code,row.reference,row.payment_method,row.payment_place,fullName(investor),investor?.dui,investment?.investment_code,row.amount,row.payment_type].join(' '),
   {investor_id:row.investor_id,investment_id:row.investment_id,tab:'Perfil 360'}
  )
 }

 for(const row of documents){
  const investor=investorMap.get(row.investor_id)
  push(
   'Documento',row.id,row.document_code||row.title||'Documento',
   fullName(investor)+' · '+String(row.document_type||''),
   [row.document_code,row.title,row.document_type,fullName(investor),investor?.dui,row.notes].join(' '),
   {investor_id:row.investor_id,investment_id:row.investment_id,tab:'Perfil 360'}
  )
 }

 for(const row of beneficiaries){
  const investor=investorMap.get(row.investor_id)
  push(
   'Beneficiario',row.id,row.full_name||'Beneficiario',
   'De '+fullName(investor),
   [row.beneficiary_code,row.full_name,row.dui,row.phone,row.email,row.relationship,fullName(investor)].join(' '),
   {investor_id:row.investor_id,tab:'Perfil 360'}
  )
 }

 return rows
  .sort((a,b)=>b.rank-a.rank||a.type.localeCompare(b.type)||a.title.localeCompare(b.title))
  .slice(0,limit)
}
